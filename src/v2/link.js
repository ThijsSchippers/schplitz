// Schplitz v2 prototype — link format (docs/v2.0.md §3.4).
//
//   #s=5.<tallyId>.<question>.<iv + AES-256-GCM(deflate(payload))>
//
// The header (version, tallyId, question) is readable so a phone can route the
// link and show the question before decrypting. It's bound to the ciphertext as
// additional authenticated data, so it can't be swapped onto another payload.
import { normalizeAnswer, PBKDF2_ITERS } from "../utils.js";
import { WINDOW_DAYS, WINDOW_MIN, dayNumber, entryKey, openDisputes } from "./tally.js";

export const LINK_VERSION = 5;
export const LINK_BUDGET  = 2000;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));
const bytesToHex = (b) => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// Derived once per tally and kept as a non-extractable key (docs §4).
export async function deriveKey(answer, tallyId) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizeAnswer(answer)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: hexToBytes(tallyId), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ─── which entries travel: the correction window ─────────────────────────────

export function selectWindow(tally, today = dayNumber()) {
  const all = Object.values(tally.entries);
  const keep = new Map();
  const add = (e) => e && keep.set(entryKey(e.w, e.s), e);
  const byKey = (w, s) => tally.entries[entryKey(w, s)];

  all.filter(e => e.d >= today - WINDOW_DAYS).forEach(add);
  [...all].sort((a, b) => b.d - a.d || (entryKey(b.w, b.s) > entryKey(a.w, a.s) ? 1 : -1)).slice(0, WINDOW_MIN).forEach(add);
  const open = openDisputes(tally);
  open.forEach(add);

  // Whatever an included entry refers to travels with it.
  for (const e of [...keep.values()]) {
    if (e.t === "edit" || e.t === "void") add(byKey(e.w, e.r));
    if (e.t === "notme" || e.t === "query") add(byKey(...e.r));
    if (e.t === "resolve") { const d = byKey(...e.r); add(d); if (d) add(byKey(...d.r)); }
  }
  const pinned = new Set();
  for (const d of open) { pinned.add(entryKey(d.w, d.s)); pinned.add(entryKey(...d.r)); }
  return { entries: [...keep.values()], pinned };
}

// ─── encoding ────────────────────────────────────────────────────────────────

function payloadOf(tally, entries) {
  return {
    cur: tally.currency, ae: tally.aboutEven,
    m: tally.members.map(m => [m.id, m.name]),
    w: Object.fromEntries(Object.entries(tally.writers)
      .filter(([, x]) => x.summary.s > 0)
      .map(([w, { member, summary: { s, h, n, c } }]) => [w, [member, s, h, n, c]])),
    e: entries,
  };
}

async function seal(tally, key, payload, origin) {
  const header = `${LINK_VERSION}.${b64url(hexToBytes(tally.id))}.${b64url(new TextEncoder().encode(tally.question))}`;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream("deflate-raw"));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(header) }, key, plain));
  const body = new Uint8Array(12 + ct.length); body.set(iv); body.set(ct, 12);
  return `${origin}/#s=${header}.${b64url(body)}`;
}

// Builds the link. If it's over budget, the oldest entries that aren't part of an
// open dispute are left out until it fits. The summaries are never left out, so
// the balance in the link is always exact.
export async function encodeLink(tally, key, { today = dayNumber(), budget = LINK_BUDGET, origin = "https://schplitz.com" } = {}) {
  const { entries, pinned } = selectWindow(tally, today);
  const droppable = entries.filter(e => !pinned.has(entryKey(e.w, e.s))).sort((a, b) => a.d - b.d || a.s - b.s);
  const build = async (drop) => {
    const gone = new Set(droppable.slice(0, drop).map(e => entryKey(e.w, e.s)));
    const kept = entries.filter(e => !gone.has(entryKey(e.w, e.s)));
    const url = await seal(tally, key, payloadOf(tally, kept), origin);
    return { url, length: url.length, entries: kept.length, dropped: drop };
  };
  const full = await build(0);
  if (full.length <= budget) return full;
  // Fewest dropped entries that fit. Compression makes size only roughly monotonic,
  // so the result is checked again below.
  let lo = 1, hi = droppable.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((await build(mid)).length <= budget) hi = mid; else lo = mid + 1;
  }
  return build(lo);
}

// ─── decoding ────────────────────────────────────────────────────────────────

export function readHeader(url) {
  const m = /#s=(\d+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)\.([A-Za-z0-9_-]+)$/.exec(url);
  if (!m) throw new Error("Not a Schplitz v2 link");
  const [, version, id, q, body] = m;
  if (Number(version) !== LINK_VERSION) throw new Error(`Unsupported link version ${version}`);
  return {
    version: Number(version), tallyId: bytesToHex(fromB64url(id)),
    question: new TextDecoder().decode(fromB64url(q)),
    aad: `${version}.${id}.${q}`, body,
  };
}

export async function decodeLink(url, key) {
  const h = readHeader(url);
  const raw = fromB64url(h.body);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(h.aad) }, key, raw.slice(12));
  const payload = JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(plain), new DecompressionStream("deflate-raw"))));
  return { header: h, payload };
}
