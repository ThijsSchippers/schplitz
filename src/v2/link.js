// Schplitz v2 prototype — link format (docs/v2.0.md §3.4; payload fields in schema.js).
//
//   https://schplitz.com/#s=5.<tallyId>.<question>.<iv + AES-256-GCM(deflate(payload JSON))>
//
// Everything after `#` stays on the phone: browsers don't send it to the server.
// The header (version, tally ID, question) is readable so a phone can route the link
// and show the question before decrypting. It's bound to the ciphertext as additional
// authenticated data, so it can't be altered or moved onto another payload.

import { normalizeAnswer } from "../utils.js";
import { WINDOW_DAYS, WINDOW_MIN, dayNumber, allEntries, entryOf, openDisputes } from "./tally.js";
import { SchplitzError, TALLY_ID, checkPayload, FLAG_LEGACY, FLAG_PROVISIONAL } from "./schema.js";
import { deflate, inflate, fromBase64Url, fromHex, toBase64Url, toHex, utf8 } from "./encoding.js";

export const LINK_VERSION = 5;
export const LINK_BUDGET = 2000;               // chars; fits chat apps and a QR code
export const MAX_PAYLOAD_BYTES = 8_000_000;    // decompressed; a full copy of a very large tally
export const KDF_ITERATIONS = 600_000;         // PBKDF2-SHA256, OWASP 2023. Runs once per tally.
export const DEFAULT_ORIGIN = "https://schplitz.com";

/**
 * The tally's encryption key: derived once when joining and kept as a non-extractable
 * CryptoKey, so the answer is typed once per tally (docs §4).
 */
export async function deriveKey(answer, tallyId) {
  if (!TALLY_ID.test(tallyId)) throw new SchplitzError("invalid-input", "Invalid tally ID");
  const base = await crypto.subtle.importKey("raw", utf8(normalizeAnswer(answer)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromHex(tallyId), iterations: KDF_ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ─── which entries travel: the correction window (docs §3.4) ─────────────────

// Order entries by the day they were written, then writer, then seq.
const byAge = (a, b) => a.d - b.d || (a.w < b.w ? -1 : a.w > b.w ? 1 : a.s - b.s);
const keyOf = (e) => `${e.w}:${e.s}`;

/**
 * The entries a normal link carries: everything written in the last 30 days, at
 * least the last 20, every open dispute with its payment, and whatever an included
 * entry refers to. `pinned`: entries that must never be left out to fit the budget.
 */
export function selectWindow(tally, today = dayNumber()) {
  const all = allEntries(tally).sort(byAge);
  const keep = new Map();
  const add = (e) => { if (e) keep.set(keyOf(e), e); };

  all.filter(e => e.d >= today - WINDOW_DAYS).forEach(add);
  all.slice(-WINDOW_MIN).forEach(add);
  const open = openDisputes(tally);
  open.forEach(add);

  for (const e of [...keep.values()]) {
    if (e.t === "edit" || e.t === "void") add(entryOf(tally, e.w, e.r));
    else if (e.t === "notme" || e.t === "query") add(entryOf(tally, ...e.r));
    else if (e.t === "resolve") { const d = entryOf(tally, ...e.r); add(d); if (d) add(entryOf(tally, ...d.r)); }
  }
  const pinned = new Set(open.flatMap(d => [keyOf(d), `${d.r[0]}:${d.r[1]}`]));
  return { entries: [...keep.values()], pinned };
}

// ─── encoding ────────────────────────────────────────────────────────────────

function payloadOf(tally, entries) {
  const w = {};
  for (const [id, { member, legacy, provisional, summary }] of Object.entries(tally.writers)) {
    if (summary.s === 0) continue;
    const fl = (legacy ? FLAG_LEGACY : 0) | (provisional ? FLAG_PROVISIONAL : 0);
    w[id] = { m: member, ...summary, ...(fl ? { fl } : {}) };
  }
  return { cur: tally.currency, ae: tally.aboutEven, m: tally.members.map(m => [m.id, m.name]), w, e: entries };
}

const headerOf = (tally) => `${LINK_VERSION}.${toBase64Url(fromHex(tally.id))}.${toBase64Url(utf8(tally.question))}`;

async function seal(tally, key, payload, origin) {
  const header = headerOf(tally);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(header) }, key, await deflate(utf8(JSON.stringify(payload)))));
  const body = new Uint8Array(iv.length + ciphertext.length);
  body.set(iv);
  body.set(ciphertext, iv.length);
  return `${origin}/#s=${header}.${toBase64Url(body)}`;
}

/**
 * Builds a link. Returns { url, length, entries, dropped, fitsBudget }.
 *
 * Normal links carry every summary plus the correction window. If that's over budget,
 * the oldest entries that aren't pinned are left out until it fits; summaries are never
 * left out, so the balance is always exact. `fitsBudget` is false when even that isn't
 * enough (then send a full copy as a file).
 *
 * Options:
 *   full                every entry, no window, no budget: the first sync of a converted
 *                       v1 tally, and full-copy files. Other people's provisional v1
 *                       copies travel as ID lists only…
 *   includeProvisional  …unless this is set ("Send full copy" to a phone that lost its data).
 */
export async function encodeLink(tally, key, {
  today = dayNumber(), budget = LINK_BUDGET, origin = DEFAULT_ORIGIN, full = false, includeProvisional = false,
} = {}) {
  const result = (url, entries, dropped) => ({ url, length: url.length, entries, dropped, fitsBudget: url.length <= budget });

  if (full) {
    const asLists = includeProvisional ? [] : Object.keys(tally.writers).filter(w => tally.writers[w].provisional && tally.writers[w].summary.s > 0);
    const entries = allEntries(tally).filter(e => !asLists.includes(e.w)).sort(byAge);
    const payload = payloadOf(tally, entries);
    if (asLists.length) payload.pl = Object.fromEntries(asLists.map(w =>
      [w, Object.values(tally.logs[w] ?? {}).map(e => e.l).filter(Boolean)]));
    return result(await seal(tally, key, payload, origin), entries.length, 0);
  }

  const { entries, pinned } = selectWindow(tally, today);
  const droppable = entries.filter(e => !pinned.has(keyOf(e))).sort(byAge);
  const build = async (drop) => {
    const gone = new Set(droppable.slice(0, drop).map(keyOf));
    const kept = entries.filter(e => !gone.has(keyOf(e)));
    return result(await seal(tally, key, payloadOf(tally, kept), origin), kept.length, drop);
  };

  const all = await build(0);
  if (all.fitsBudget || !droppable.length) return all;
  // Fewest left-out entries that fit. Compressed size is only roughly monotonic in
  // the number of entries, so step forward from the search result until it fits.
  let lo = 1, hi = droppable.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((await build(mid)).fitsBudget) hi = mid; else lo = mid + 1;
  }
  let best = await build(lo);
  while (!best.fitsBudget && lo < droppable.length) best = await build(++lo);
  return best;
}

// ─── decoding ────────────────────────────────────────────────────────────────

const LINK = /#s=(\d+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)\.([A-Za-z0-9_-]+)$/;

/** Reads the readable part of a link: no key needed. Throws SchplitzError. */
export function readHeader(url) {
  const m = LINK.exec(String(url).trim());
  if (!m) throw new SchplitzError("not-a-link", "Not a Schplitz link");
  const [, version, id, question, body] = m;
  if (Number(version) !== LINK_VERSION) throw new SchplitzError("unsupported-version", `Unsupported link version ${version}`);
  let tallyId, text;
  try {
    tallyId = toHex(fromBase64Url(id));
    text = new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(question));
  } catch {
    throw new SchplitzError("not-a-link", "Damaged link");
  }
  if (!TALLY_ID.test(tallyId)) throw new SchplitzError("not-a-link", "Damaged link");
  return { version: Number(version), tallyId, question: text, aad: `${version}.${id}.${question}`, body };
}

/**
 * Decrypts and validates a link. Throws SchplitzError:
 *   cannot-decrypt   wrong answer, or the link was altered or cut off
 *   too-large        decompresses beyond MAX_PAYLOAD_BYTES
 *   invalid-payload  decrypted, but the content isn't valid
 */
export async function decodeLink(url, key) {
  const header = readHeader(url);
  let plain;
  try {
    const raw = fromBase64Url(header.body);
    plain = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.subarray(0, 12), additionalData: utf8(header.aad) }, key, raw.subarray(12)));
  } catch {
    throw new SchplitzError("cannot-decrypt", "Wrong answer, or the link is damaged");
  }
  let json;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(await inflate(plain, MAX_PAYLOAD_BYTES));
  } catch (err) {
    throw err instanceof RangeError
      ? new SchplitzError("too-large", "This link is too large to open.")
      : new SchplitzError("invalid-payload", "The link's content can't be read");
  }
  let payload;
  try { payload = JSON.parse(json); } catch { throw new SchplitzError("invalid-payload", "The link's content can't be read"); }
  return { header, payload: checkPayload(payload) };
}
