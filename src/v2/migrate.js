// Schplitz v2 prototype — bringing in v1 tallies (docs/v2.0-migration.md).
//
// Sources: the v1 data still on this phone (localStorage "schplitzExpenses"), and
// old v3/v4 share links or pasted text exports. Any of them can be brought in again
// at any time; everything is matched by v1 expense ID.
//
// Converted history lives in "legacy writers", one per person, whose IDs are derived
// from the question, names and answer. My own legacy writer is authoritative on my
// phone; the other person's is a provisional copy until their own version arrives.
// Converted entries are frozen: they can be sorted and disputed, not edited.

import { normalizeAnswer, validateExpense, decrypt, decryptCompressed, decompressFromUrl, CURRENCIES, FALLBACK_RATES } from "../utils.js";
import { ABOUT_EVEN, addPayment, emptySummary, foldLog, logOf, replaceLog } from "./tally.js";
import { OTHER } from "./categories.js";
import { KDF_ITERATIONS, deriveKey } from "./link.js";
import { SchplitzError, checkName, checkQuestion } from "./schema.js";
import { dayOfIsoDate, decimalsOf, randomHex, toHex, toMinorUnits, utf8 } from "./encoding.js";

export const V1_STORAGE_KEY = "schplitzExpenses";

// ─── reading v1 data ─────────────────────────────────────────────────────────

/**
 * Which v1 shape is stored (migration doc §1.1):
 *   A1  current shape                          → convert
 *   A2  before 28 Mar 2026: plain-text answer  → convert, then scrub the answer
 *   A3  the one-day 10 Feb 2026 version        → left alone
 *   none / unreadable
 */
export function readV1Storage(raw) {
  if (!raw) return { kind: "none" };
  let p;
  try { p = JSON.parse(raw); } catch { return { kind: "unreadable" }; }
  if (!p || typeof p !== "object" || Array.isArray(p)) return { kind: "unreadable" };
  if (!p.initialized) return { kind: "A3" };
  return {
    kind: p.securityAnswer ? "A2" : "A1",
    data: {
      names: [p.myName, p.otherName], myName: p.myName, question: p.securityQuestion,
      expenses: Array.isArray(p.expenses) ? p.expenses : [],
      settlements: p.settlements && typeof p.settlements === "object" ? p.settlements : {},
    },
    answer: typeof p.securityAnswer === "string" ? p.securityAnswer : null,
  };
}

/** The same storage with the plain-text answer removed. Everything else is untouched. */
export function scrubAnswer(raw) {
  const p = JSON.parse(raw);
  delete p.securityAnswer;
  return JSON.stringify(p);
}

/** Identifies a version of the v1 storage, so bringing it in again can skip unchanged data. */
export async function fingerprint(raw) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(raw)))).slice(0, 32);
}

/** An old share link (#share=…) or pasted text export: what can be read without the answer. */
export async function readV1Share(input) {
  let o;
  try {
    const text = input.includes("#share=") ? await decompressFromUrl(input.split("#share=")[1].trim()) : input;
    o = JSON.parse(text);
  } catch {
    throw new SchplitzError("not-a-link", "Not a Schplitz v1 link");
  }
  if (!o || (o.v !== 3 && o.v !== 4) || typeof o.encrypted !== "string") throw new SchplitzError("not-a-link", "Not a Schplitz v1 link");
  return { v: o.v, question: String(o.question ?? ""), names: Array.isArray(o.names) ? o.names : [], encrypted: o.encrypted };
}

/** Decrypts an old share. Throws SchplitzError("cannot-decrypt") for a wrong answer. */
export async function openV1Share(share, answer) {
  let data;
  try {
    const json = share.v === 4
      ? await decryptCompressed(share.encrypted, normalizeAnswer(answer))
      : await decrypt(share.encrypted, normalizeAnswer(answer));
    data = JSON.parse(json);
  } catch {
    throw new SchplitzError("cannot-decrypt", "Wrong answer, or the link is damaged");
  }
  if (!Array.isArray(data?.expenses)) throw new SchplitzError("invalid-payload", "The link's content can't be read");
  return {
    question: share.question, names: share.names,
    expenses: data.expenses.map(e => ({
      id: e?.id ?? e?.i, description: e?.description ?? e?.d, amount: e?.amount ?? e?.a,
      currency: e?.currency ?? e?.c, paidBy: e?.paidBy ?? e?.p, date: e?.date ?? e?.t,
    })),
    settlement: typeof data.settlement === "string" ? data.settlement : null,
  };
}

// ─── deterministic identity (migration doc, step 3) ──────────────────────────

/**
 * Both phones hold the same question, names and answer, so they derive the same
 * tally ID, member IDs and legacy writer IDs without talking to each other.
 * Inputs are JSON-encoded, so no combination of names can collide with another.
 */
export async function deriveV1Identity(answer, question, names) {
  const base = await crypto.subtle.importKey("raw", utf8(normalizeAnswer(answer)), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: utf8(JSON.stringify(["schplitz-v1", question, [...names].sort()])), iterations: KDF_ITERATIONS, hash: "SHA-256" },
    base, 256);
  const hkdf = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
  const derive = async (info, bytes) => toHex(new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(JSON.stringify(info)) }, hkdf, bytes * 8)));
  const members = {}, legacyWriters = {};
  for (const name of names) {
    members[name] = await derive(["member", name], 4);
    legacyWriters[name] = await derive(["legacy-writer", name], 4);
  }
  return { tallyId: await derive(["tally-id"], 16), members, legacyWriters };
}

// ─── exchange rates ──────────────────────────────────────────────────────────

/**
 * A rate lookup for locking values: (isoDate, currency) → { rate, estimated }, where
 * rate is units of `currency` per euro. Results are cached per date and currency for
 * the session. When the rate source can't answer (offline, or a currency it doesn't
 * cover), v1's fixed fallback rates are used and the result is marked estimated.
 */
export function createRateLookup({ fetchFn = (...a) => fetch(...a), timeoutMs = 5000 } = {}) {
  const cache = new Map();
  return (date, currency) => {
    if (currency === "EUR") return Promise.resolve({ rate: 1, estimated: false });
    const key = `${date}|${currency}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      try {
        const r = await fetchFn(`https://api.frankfurter.app/${date}?from=EUR&to=${currency}`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rate = (await r.json())?.rates?.[currency];
        if (!(rate > 0)) throw new Error("no rate");
        return { rate, estimated: false };
      } catch {
        return { rate: FALLBACK_RATES[currency] ?? 1, estimated: true };
      }
    })());
    return cache.get(key);
  };
}

export const defaultRate = createRateLookup();

// ─── converting expenses ─────────────────────────────────────────────────────

/**
 * v1 IDs start with their creation time in base 36. The first 12 characters (time
 * plus 4 random) identify an entry within a tally and keep links short.
 */
export const shortId = (id) => String(id).slice(0, 12);

/** Creation time (ms) encoded in a v1 ID, or 0. */
export const createdAt = (id) => { const t = parseInt(String(id).split("-")[0], 36); return Number.isFinite(t) ? t : 0; };

const byCreation = (a, b) => createdAt(a.id) - createdAt(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Sorts v1 expenses into mine, theirs, and what can't be converted. */
function classify(expenses, myName, otherName) {
  const mine = [], theirs = [], invalid = [], unassigned = [];
  for (const e of expenses) {
    try { validateExpense(e); } catch (err) { invalid.push({ expense: e, reason: err.message }); continue; }
    if (!Object.hasOwn(CURRENCIES, e.currency)) { invalid.push({ expense: e, reason: "Unknown currency" }); continue; }
    if (e.paidBy === myName) mine.push(e);
    else if (e.paidBy === otherName) theirs.push(e);
    else unassigned.push(e);
  }
  return { mine: mine.sort(byCreation), theirs: theirs.sort(byCreation), invalid, unassigned };
}

/** Payment fields for one v1 expense: Something else, both people in it, rate locked now. */
async function paymentFields(e, rateFor) {
  const { rate, estimated } = await rateFor(e.date, e.currency);
  return {
    k: OTHER, a: toMinorUnits(e.amount, decimalsOf(e.currency)), c: e.currency,
    v: toMinorUnits(e.amount / rate, 2),   // converted tallies use EUR
    l: shortId(e.id), ...(estimated ? { e: 1 } : {}),
  };
}

/**
 * Builds a legacy writer's log from v1 expenses and computes its summary. For converted
 * entries, `d` is the v1 expense date: they were written before v2 existed.
 */
async function buildLegacyLog(tally, w, expenses, rateFor) {
  const p = tally.members.map(m => m.id);
  const entries = [];
  for (const [i, e] of expenses.entries())
    entries.push({ w, s: i + 1, d: dayOfIsoDate(e.date), t: "pay", ...(await paymentFields(e, rateFor)), p });
  replaceLog(tally, w, entries);
  tally.writers[w].summary = await foldLog(tally.writers[w].member, logOf(tally, w));
}

const notesFrom = (expenses) => Object.fromEntries(expenses.map(e => [shortId(e.id), e.description]));

// ─── the conversion ──────────────────────────────────────────────────────────

/**
 * Creates a v2 tally from v1 data (from readV1Storage().data or openV1Share()).
 * Returns { tally, key }. Descriptions and settlement messages stay on this phone,
 * in `tally.v1`, and never travel in a link.
 */
export async function convertV1({ data, myName, answer, rateFor = defaultRate, source = "device" }) {
  const names = data.names;
  if (!Array.isArray(names) || names.length !== 2 || names[0] === names[1] || !names.includes(myName))
    throw new SchplitzError("invalid-input", "This Schplitz 1 tally is missing a name, so it can't be brought in.");
  names.forEach(checkName);
  checkQuestion(data.question);
  const otherName = names.find(n => n !== myName);
  const id = await deriveV1Identity(answer, data.question, names);
  const me = { member: id.members[myName], writer: randomHex(4) };
  const mineW = id.legacyWriters[myName], theirsW = id.legacyWriters[otherName];
  const tally = {
    id: id.tallyId, question: data.question, currency: "EUR", aboutEven: ABOUT_EVEN,
    members: names.map(name => ({ id: id.members[name], name })), me,
    writers: {
      [me.writer]: { member: me.member, summary: emptySummary() },
      [mineW]:     { member: id.members[myName],    legacy: true, provisional: false, summary: emptySummary() },
      [theirsW]:   { member: id.members[otherName], legacy: true, provisional: true,  summary: emptySummary() },
    },
    logs: {},
  };
  const parts = classify(data.expenses, myName, otherName);
  await buildLegacyLog(tally, mineW, parts.mine, rateFor);
  await buildLegacyLog(tally, theirsW, parts.theirs, rateFor);
  tally.v1 = {
    source,
    notes: notesFrom([...parts.mine, ...parts.theirs]),
    settlements: { ...(data.settlements ?? {}), ...(data.settlement ? { [otherName]: data.settlement } : {}) },
    invalid: parts.invalid, unassigned: parts.unassigned,
    newestProvisional: Math.max(0, ...parts.theirs.map(e => createdAt(e.id))),
  };
  return { tally, key: await deriveKey(answer, tally.id) };
}

/**
 * First load of v2 on a phone with v1 data. The answer comes from the person, or from
 * A2 storage. Returns { kind, tally, key, scrubbedStorage } — write `scrubbedStorage`
 * back when it isn't null — or { kind, needsAnswer, question }, or { kind } when
 * there's nothing to convert.
 */
export async function convertFromDevice(raw, { answer, rateFor } = {}) {
  const read = readV1Storage(raw);
  if (read.kind !== "A1" && read.kind !== "A2") return { kind: read.kind };
  const useAnswer = answer ?? read.answer;
  if (!useAnswer) return { kind: read.kind, needsAnswer: true, question: read.data.question };
  const { tally, key } = await convertV1({ data: read.data, myName: read.data.myName, answer: useAnswer, rateFor });
  tally.v1.fingerprint = await fingerprint(raw);
  return { kind: read.kind, tally, key, scrubbedStorage: read.kind === "A2" ? scrubAnswer(raw) : null };
}

/**
 * Brings the device data in again (Settings → Bring in an old tally). Only my own v1
 * expenses this tally hasn't seen are added, as new payments (for example from a v1
 * tab that was left open). Returns { added }.
 */
export async function reimportFromDevice(tally, raw, { rateFor = defaultRate } = {}) {
  const fp = await fingerprint(raw);
  if (fp === tally.v1?.fingerprint) return { added: 0 };
  const read = readV1Storage(raw);
  if (read.kind !== "A1" && read.kind !== "A2") return { added: 0 };
  const myName = tally.members.find(m => m.id === tally.me.member).name;
  const otherName = tally.members.find(m => m.id !== tally.me.member).name;
  const known = new Set(Object.values(tally.logs).flatMap(log => Object.values(log)).map(e => e.l).filter(Boolean));
  const fresh = classify(read.data.expenses, myName, otherName).mine.filter(e => !known.has(shortId(e.id)));
  for (const e of fresh) {
    const { k, a, c, v, l, e: estimated } = await paymentFields(e, rateFor);
    await addPayment(tally, { category: k, amount: a, currency: c, value: v, paidOn: dayOfIsoDate(e.date), legacyId: l, estimated });
  }
  tally.v1 = { ...tally.v1, fingerprint: fp, notes: { ...tally.v1?.notes, ...notesFrom(fresh) } };
  return { added: fresh.length };
}

// ─── old links after the upgrade (migration doc, step 5) ─────────────────────

/**
 * Applies an opened v1 share to this phone. `tally`: the converted tally it may belong
 * to, or null. `myName` is only needed when `tally` is null.
 *
 * Outcomes:
 *   created          no tally yet: one is created from the link
 *   different-tally  the link belongs to another tally (other question or names)
 *   up-to-date       the other person's own version has already arrived; link ignored
 *   older            the link isn't newer than the copy this phone has; ignored
 *   updated          the provisional copy of the other person's entries was refreshed
 *
 * "Newer" means the link holds a more recently created expense by the other person.
 * A newer link that only deletes entries can't be recognised as newer (v1 links have
 * no timestamp); the other person's first v2 sync corrects that.
 */
export async function applyV1Share(tally, opened, { myName, answer, rateFor = defaultRate }) {
  if (!tally) {
    const { tally: created, key } = await convertV1({ data: opened, myName, answer, rateFor, source: "link" });
    return { outcome: "created", tally: created, key };
  }
  const me = tally.members.find(m => m.id === tally.me.member).name;
  const id = await deriveV1Identity(answer, opened.question, opened.names);
  if (id.tallyId !== tally.id || !opened.names.includes(me)) return { outcome: "different-tally" };
  const otherName = opened.names.find(n => n !== me);
  const w = id.legacyWriters[otherName];
  if (!tally.writers[w]?.provisional) return { outcome: "up-to-date", tally };
  const theirs = classify(opened.expenses, me, otherName).theirs;
  const newest = Math.max(0, ...theirs.map(e => createdAt(e.id)));
  if (newest <= (tally.v1?.newestProvisional ?? 0)) return { outcome: "older", tally };
  await buildLegacyLog(tally, w, theirs, rateFor);
  tally.v1 = { ...tally.v1, newestProvisional: newest, notes: { ...tally.v1?.notes, ...notesFrom(theirs) } };
  return { outcome: "updated", tally };
}

/** "This is Liam's upgraded tally, but your answers don't match" (migration doc, step 3). */
export function looksLikeMismatchedAnswer(tally, header) {
  return Boolean(tally?.v1) && header.question === tally.question && header.tallyId !== tally.id;
}
