// Schplitz v2 prototype — bringing in v1 tallies (docs/v2.0-migration.md).
//
// Sources: the v1 data still on this phone (localStorage "schplitzExpenses"),
// and old v3/v4 share links or pasted text exports. All of them can be brought
// in again at any time; everything is matched by v1 expense ID.
import {
  normalizeAnswer, validateExpense, decrypt, decryptCompressed, decompressFromUrl,
  CURRENCIES, FALLBACK_RATES, PBKDF2_ITERS,
} from "../utils.js";
import { ABOUT_EVEN, entryKey, foldLog, logOf, randomId, addPayment } from "./tally.js";
import { OTHER as OTHER_CATEGORY } from "./categories.js";
import { deriveKey } from "./link.js";

export const V1_STORAGE_KEY = "schplitzExpenses";

const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

// ─── reading v1 data ─────────────────────────────────────────────────────────

// Which v1 shape is stored (migration doc §1.1): A1 current, A2 with a plain-text
// answer (before 28 Mar 2026), A3 the one-day 10 Feb version (left alone).
export function readV1Storage(raw) {
  if (!raw) return { kind: "none" };
  let p;
  try { p = JSON.parse(raw); } catch { return { kind: "unreadable" }; }
  if (!p || typeof p !== "object") return { kind: "unreadable" };
  if (!p.initialized) return { kind: "A3" };
  return {
    kind: p.securityAnswer ? "A2" : "A1",
    data: {
      myName: p.myName || "", otherName: p.otherName || "", question: p.securityQuestion || "",
      expenses: Array.isArray(p.expenses) ? p.expenses : [],
      settlements: p.settlements || {},
    },
    answer: p.securityAnswer || null,
  };
}

// The same storage with the plain-text answer removed. Everything else is kept untouched.
export function scrubAnswer(raw) {
  const p = JSON.parse(raw);
  delete p.securityAnswer;
  return JSON.stringify(p);
}

export async function fingerprint(raw) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)))).slice(0, 32);
}

// Old share link (#share=…) or pasted text export: what can be read without the answer.
export async function readV1Share(input) {
  const text = input.includes("#share=") ? await decompressFromUrl(input.split("#share=")[1].trim()) : input;
  const o = JSON.parse(text);
  if (!o || (o.v !== 3 && o.v !== 4) || typeof o.encrypted !== "string") throw new Error("Not a Schplitz v1 link");
  return { v: o.v, question: o.question || "", names: Array.isArray(o.names) ? o.names : [], encrypted: o.encrypted };
}

export async function openV1Share(share, answer) {
  const json = share.v === 4
    ? await decryptCompressed(share.encrypted, normalizeAnswer(answer))
    : await decrypt(share.encrypted, normalizeAnswer(answer));
  const data = JSON.parse(json);
  if (!Array.isArray(data.expenses)) throw new Error("Invalid data format");
  return {
    question: share.question, names: share.names,
    expenses: data.expenses.map(e => ({
      id: e.id ?? e.i, description: e.description ?? e.d, amount: e.amount ?? e.a,
      currency: e.currency ?? e.c, paidBy: e.paidBy ?? e.p, date: e.date ?? e.t,
    })),
    settlement: typeof data.settlement === "string" ? data.settlement : null,
  };
}

// ─── deterministic identity (migration doc, step 3) ──────────────────────────
// Both phones hold the same question, names and answer, so they derive the same
// tally ID, member IDs and legacy writer IDs without talking to each other.

export async function deriveV1Identity(answer, question, names) {
  const sorted = [...names].sort();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizeAnswer(answer)), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(`schplitz-v1|${question}|${sorted.join("|")}`), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base, 256);
  const hkdf = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
  const bits = async (info, bytes) => hex(new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(info) }, hkdf, bytes * 8)));
  const tallyId = await bits("tally-id", 16);
  const members = {}, legacyWriters = {};
  for (const name of names) {
    members[name] = await bits(`member|${name}`, 4);
    legacyWriters[name] = await bits(`legacy-writer|${name}`, 4);
  }
  return { tallyId, members, legacyWriters };
}

// ─── converting expenses ─────────────────────────────────────────────────────

const decimalsOf = (currency) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;

const dayOf = (date) => Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000);

// v1 IDs start with their creation time in base 36. The first 12 characters (time
// plus 4 random) identify an entry within a tally and keep links short.
export const shortId = (id) => String(id).slice(0, 12);

// v1 IDs start with their creation time in base 36.
export const createdAt = (id) => { const t = parseInt(String(id).split("-")[0], 36); return Number.isFinite(t) ? t : 0; };

// Rate lookup for locking values (EUR per unit of currency → value in cents).
// Returns { rate, estimated }. Injected in tests; the default asks Frankfurter once
// per date and currency and falls back to v1's fixed rates.
export async function defaultRate(date, currency) {
  if (currency === "EUR") return { rate: 1, estimated: false };
  try {
    const r = await fetch(`https://api.frankfurter.app/${date}?from=EUR&to=${currency}`);
    const rate = (await r.json()).rates?.[currency];
    if (rate == null) throw new Error("no rate");
    return { rate, estimated: false };
  } catch {
    return { rate: FALLBACK_RATES[currency] ?? 1, estimated: true };
  }
}

// One v1 expense → one v2 payment entry (category Something else, both people in it).
async function toEntry(e, w, s, memberIds, rateFor) {
  const { rate, estimated } = await rateFor(e.date, e.currency);
  return {
    w, s, d: dayOf(e.date), t: "pay", k: OTHER_CATEGORY,
    a: Math.round(e.amount * 10 ** decimalsOf(e.currency)), c: e.currency,
    v: Math.round((e.amount / rate) * 100), p: memberIds,
    l: shortId(e.id), ...(estimated ? { e: 1 } : {}),
  };
}

function sortExpenses(expenses) {
  return [...expenses].sort((a, b) => createdAt(a.id) - createdAt(b.id) || (a.id < b.id ? -1 : 1));
}

// Builds a legacy writer's log from v1 expenses and computes its summary.
async function buildLegacyLog(tally, w, member, expenses, rateFor) {
  for (const k of Object.keys(tally.entries)) if (tally.entries[k].w === w) delete tally.entries[k];
  const memberIds = tally.members.map(m => m.id);
  let s = 0;
  for (const e of sortExpenses(expenses)) {
    const entry = await toEntry(e, w, ++s, memberIds, rateFor);
    tally.entries[entryKey(w, s)] = entry;
  }
  tally.writers[w].summary = await foldLog(member, logOf(tally, w));
}

function split(expenses, myName, otherName) {
  const valid = [], invalid = [], unassigned = [];
  for (const e of expenses) {
    try { validateExpense(e); } catch (err) { invalid.push({ expense: e, reason: err.message }); continue; }
    if (!CURRENCIES[e.currency]) { invalid.push({ expense: e, reason: "Unknown currency" }); continue; }
    if (e.paidBy === myName || e.paidBy === otherName) valid.push(e); else unassigned.push(e);
  }
  return {
    mine: valid.filter(e => e.paidBy === myName), theirs: valid.filter(e => e.paidBy === otherName),
    invalid, unassigned,
  };
}

// ─── the conversion ──────────────────────────────────────────────────────────

// Creates a v2 tally from v1 data. `data` comes from readV1Storage().data or openV1Share().
// My own expenses become my legacy log (I'm the authority on them); the other person's
// become a provisional copy until their own version arrives.
export async function convertV1({ data, myName, answer, rateFor = defaultRate, source = "device" }) {
  const names = data.names ?? [data.myName, data.otherName];
  const otherName = names.find(n => n !== myName);
  if (!names.includes(myName) || !otherName) throw new Error("Can't tell who is who in this tally");
  const id = await deriveV1Identity(answer, data.question, names);
  const members = names.map(name => ({ id: id.members[name], name }));
  const me = { member: id.members[myName], writer: randomId(4) };
  const tally = {
    id: id.tallyId, question: data.question, currency: "EUR", aboutEven: ABOUT_EVEN, members, me,
    writers: {
      [me.writer]: { member: me.member, summary: { s: 0, h: "0".repeat(16), n: {}, c: {} } },
      [id.legacyWriters[myName]]:    { member: id.members[myName], legacy: true, provisional: false, summary: null },
      [id.legacyWriters[otherName]]: { member: id.members[otherName], legacy: true, provisional: true, summary: null },
    },
    entries: {},
    legacy: { notes: {}, settlements: {}, invalid: [], unassigned: [], source, names, newestProvisional: 0 },
  };
  const parts = split(data.expenses, myName, otherName);
  await buildLegacyLog(tally, id.legacyWriters[myName], id.members[myName], parts.mine, rateFor);
  await buildLegacyLog(tally, id.legacyWriters[otherName], id.members[otherName], parts.theirs, rateFor);
  tally.legacy.newestProvisional = Math.max(0, ...parts.theirs.map(e => createdAt(e.id)));
  // Descriptions and settlement messages stay on this phone only, never in a link.
  for (const e of [...parts.mine, ...parts.theirs]) tally.legacy.notes[shortId(e.id)] = e.description;
  if (data.settlements) tally.legacy.settlements = { ...data.settlements };
  if (data.settlement) tally.legacy.settlements[otherName] = data.settlement;
  tally.legacy.invalid = parts.invalid;
  tally.legacy.unassigned = parts.unassigned;
  return { tally, key: await deriveKey(answer, tally.id) };
}

// First load of v2 on a phone with v1 data. The answer comes from the person, or
// from A2 storage (which is then scrubbed).
export async function convertFromDevice(raw, { answer, rateFor } = {}) {
  const read = readV1Storage(raw);
  if (read.kind !== "A1" && read.kind !== "A2") return { kind: read.kind };
  const useAnswer = answer ?? read.answer;
  if (!useAnswer) return { kind: read.kind, needsAnswer: true, question: read.data.question };
  const { tally, key } = await convertV1({ data: read.data, myName: read.data.myName, answer: useAnswer, rateFor });
  tally.legacy.fingerprint = await fingerprint(raw);
  return { kind: read.kind, tally, key, scrubbedStorage: read.kind === "A2" ? scrubAnswer(raw) : null };
}

// Bringing the device data in again later: only v1 expenses this tally hasn't seen
// (for example added in a v1 tab that was left open) are added, as new payments.
export async function reimportFromDevice(tally, raw, { rateFor = defaultRate } = {}) {
  const fp = await fingerprint(raw);
  if (fp === tally.legacy?.fingerprint) return { added: 0 };
  const read = readV1Storage(raw);
  if (read.kind !== "A1" && read.kind !== "A2") return { added: 0 };
  const known = new Set(Object.values(tally.entries).map(e => e.l).filter(Boolean));
  const myName = tally.members.find(m => m.id === tally.me.member).name;
  let added = 0;
  for (const e of sortExpenses(read.data.expenses)) {
    if (known.has(shortId(e.id)) || e.paidBy !== myName) continue;
    try { validateExpense(e); } catch { continue; }
    const { rate } = await rateFor(e.date, e.currency);
    await addPayment(tally, { category: OTHER_CATEGORY, amount: Math.round(e.amount * 10 ** decimalsOf(e.currency)),
      currency: e.currency, value: Math.round((e.amount / rate) * 100), day: dayOf(e.date), legacyId: shortId(e.id) });
    tally.legacy.notes[shortId(e.id)] = e.description;
    added++;
  }
  tally.legacy.fingerprint = fp;
  return { added };
}

// ─── old links after the upgrade (migration doc, step 5) ─────────────────────

// tally: this phone's tally that matches the link's question and names, or null.
// Returns what happened, so the app can say it.
export async function applyV1Share(tally, opened, { myName, answer, rateFor = defaultRate }) {
  if (!tally) {
    const { tally: created, key } = await convertV1({ data: opened, myName, answer, rateFor, source: "link" });
    return { outcome: "created", tally: created, key };
  }
  const id = await deriveV1Identity(answer, opened.question, opened.names);
  if (id.tallyId !== tally.id) return { outcome: "different-tally" };
  const otherName = opened.names.find(n => n !== myName);
  const w = id.legacyWriters[otherName];
  if (!tally.writers[w]?.provisional) return { outcome: "up-to-date", tally };
  const theirs = opened.expenses.filter(e => e.paidBy === otherName);
  const newest = Math.max(0, ...theirs.map(e => createdAt(e.id)));
  if (newest <= tally.legacy.newestProvisional) return { outcome: "older", tally };
  const valid = split(opened.expenses, myName, otherName).theirs;
  await buildLegacyLog(tally, w, id.members[otherName], valid, rateFor);
  tally.legacy.newestProvisional = newest;
  for (const e of valid) tally.legacy.notes[shortId(e.id)] = e.description;
  return { outcome: "updated", tally };
}

// "This is Liam's upgraded tally, but your answers don't match" (migration doc, step 3).
export function looksLikeMismatchedAnswer(tally, header) {
  return Boolean(tally?.legacy) && header.question === tally.question && header.tallyId !== tally.id;
}
