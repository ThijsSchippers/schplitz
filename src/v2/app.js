// Schplitz v2 — what the screens do, without React: the glue between the tally
// model, links, the phone's cache and v1 conversion. Every function that changes a
// tally also saves it to the cache.

import { createTally, joinTally, mergePayload, addPayment, renameTally, allEntries, dayNumber, settled, editPayment, acceptDispute } from "./tally.js";
import { deriveKey, encodeLink, decodeLink, readHeader } from "./link.js";
import {
  V1_STORAGE_KEY, convertFromDevice, defaultRate, fingerprint, looksLikeMismatchedAnswer, readV1Storage, reimportFromDevice,
  readV1Share, openV1Share, applyV1Share,
} from "./migrate.js";
import { emptyLocal } from "./cache.js";
import { SchplitzError } from "./schema.js";
import { decimalsOf, isoOfDay, toMinorUnits } from "./encoding.js";

/** How long a currency other than the tally's stays selected after it was used (docs §6.2.3). */
export const STICKY_CURRENCY_MS = 12 * 60 * 60 * 1000;

const withLocal = (tally, changes = {}) => {
  const now = Date.now();
  tally.local = { ...emptyLocal(), firstSeen: now, ...tally.local, lastSeen: now, ...changes };
  return tally;
};

/** Saves a tally after a change made with the tally.js functions. */
export async function save(cache, tally, localChanges) {
  withLocal(tally, localChanges);
  await cache.saveTally(tally);
  return tally;
}

/** Apply a domain change and persist it before reporting success to the UI. */
export async function changeTally(cache, tally, change) {
  const result = await change(tally);
  await save(cache, tally);
  return result;
}

// ─── starting and joining ────────────────────────────────────────────────────

/**
 * Creates a tally (2–10 people) and caches it with its key. `name` is optional
 * ("Padel crew"). The answer is normalised like v1's.
 */
export async function startTally(cache, { question, answer, myName, friendNames, currency, name }) {
  const tally = createTally({ question, names: [myName, ...friendNames], me: myName, currency });
  if (name?.trim()) await renameTally(tally, name);
  const key = await deriveKey(answer, tally.id);
  withLocal(tally);
  await cache.saveTallyWithKey(tally, key);
  return { tally, key };
}

/**
 * A link was opened. For a tally this phone knows: merges it and returns
 * { kind: "merged", tally, key, report }. Otherwise { kind: "join", header }: ask
 * the answer (unlockLink), then the person's name (completeJoin).
 */
export async function openLink(cache, url) {
  const header = readHeader(url);
  const [tally, key] = await Promise.all([cache.loadTally(header.tallyId), cache.loadKey(header.tallyId)]);
  if (!tally || !key) return { kind: "join", header };
  const { payload } = await decodeLink(url, key);
  const report = mergePayload(tally, payload);
  await save(cache, tally);
  return { kind: "merged", tally, key, report };
}

/**
 * Decrypts a link for a tally this phone doesn't have yet. Throws SchplitzError:
 * "answer-mismatch" when it looks like this phone's converted v1 tally but the answers
 * differ (migration doc, step 3), "cannot-decrypt" for any other wrong answer.
 */
export async function unlockLink(cache, url, answer) {
  const header = readHeader(url);
  const key = await deriveKey(answer, header.tallyId);
  try {
    const { payload } = await decodeLink(url, key);
    return { header, payload, key };
  } catch (err) {
    if (err.code === "cannot-decrypt" && (await cache.listTallies()).some(t => looksLikeMismatchedAnswer(t, header)))
      throw new SchplitzError("answer-mismatch", "This is your old tally, but your answers don't match. One of you typed it differently.");
    throw err;
  }
}

/** Joins as `memberId`. `returning`: this member already has history (a phone that lost its data). */
export async function completeJoin(cache, unlocked, memberId) {
  const { tally, returning, report } = joinTally(unlocked.header, unlocked.payload, memberId);
  withLocal(tally);
  await cache.saveTallyWithKey(tally, unlocked.key);
  return { tally, returning, report };
}

// ─── payments ────────────────────────────────────────────────────────────────

/**
 * Value of an amount in the tally currency, with today's rate for the payment date.
 * Returns { value, estimated }. rateFor: see migrate.js createRateLookup.
 */
export async function valueInTallyCurrency(tally, amount, currency, day, rateFor = defaultRate) {
  if (currency === tally.currency) return { value: amount, estimated: false };
  const iso = isoOfDay(day);
  const [from, to] = await Promise.all([rateFor(iso, currency), rateFor(iso, tally.currency)]);
  const major = amount / 10 ** decimalsOf(currency);
  const value = toMinorUnits((major / from.rate) * to.rate, decimalsOf(tally.currency));
  return { value: Math.max(1, value), estimated: from.estimated || to.estimated };
}

/** Records a payment by me (participants: who was there, default everyone), locks its rate, and remembers the currency. */
export async function recordPayment(cache, tally, { category, amount, currency, paidOn = dayNumber(), participants, rateFor }) {
  const { value, estimated } = await valueInTallyCurrency(tally, amount, currency, paidOn, rateFor);
  const entry = await addPayment(tally, { category, amount, currency, value, paidOn, participants, estimated });
  // Paying in the tally currency again ends the 12 hours of a foreign one.
  await save(cache, tally, { lastCurrency: currency === tally.currency ? null : { c: currency, at: Date.now() } });
  return entry;
}

/** Edit a payment or accept a disputed correction, preserving its locked rate unless money/date changed. */
export async function updatePayment(cache, tally, payment, fields, { dispute, rateFor } = {}) {
  const day = payment.pd ?? payment.d;
  const moneyChanged = fields.amount !== payment.a || fields.currency !== payment.c || fields.paidOn !== day;
  const value = moneyChanged
    ? (await valueInTallyCurrency(tally, fields.amount, fields.currency, fields.paidOn, rateFor)).value
    : payment.v;
  const changes = {
    k: fields.category, a: fields.amount, c: fields.currency, v: value, p: fields.participants,
    ...(fields.paidOn !== day ? { pd: fields.paidOn } : {}),
  };
  return changeTally(cache, tally, () => dispute
    ? acceptDispute(tally, [dispute.w, dispute.s], changes)
    : editPayment(tally, payment.s, changes));
}

/** The currency preselected on the logging screen: a recent foreign one for 12 hours, else the tally's. */
export function defaultCurrency(tally, now = Date.now()) {
  const last = tally.local?.lastCurrency;
  return last && now - last.at < STICKY_CURRENCY_MS ? last.c : tally.currency;
}

/** Up to three other currencies this phone used in the tally, most recent first. */
export function recentCurrencies(tally) {
  const mine = Object.values(tally.logs[tally.me.writer] ?? {}).filter(e => e.t === "pay").reverse();
  return [...new Set(mine.map(e => e.c).filter(c => c !== tally.currency))].slice(0, 3);
}

// ─── sharing ─────────────────────────────────────────────────────────────────

/** Entries I wrote that I haven't shared yet. */
export const unsharedCount = (tally) =>
  Math.max(0, (tally.writers[tally.me.writer]?.summary.s ?? 0) - (tally.local?.sharedSeq ?? 0));

/**
 * Builds the link to share, once every change already started on the tally has been
 * written (so a "Not me" tapped a moment ago is in it). The first share of a converted
 * v1 tally is a full link (migration doc, step 3); after that, normal links.
 */
export async function prepareShare(tally, key, { origin, today = dayNumber() } = {}) {
  await settled(tally);
  const full = Boolean(tally.v1) && !tally.local?.handshakeSent;
  const link = await encodeLink(tally, key, { origin, today, full });
  return { ...link, full };
}

/** Call once the person actually shared (or copied) the link. */
export function markShared(cache, tally, { full }) {
  return save(cache, tally, { sharedSeq: tally.writers[tally.me.writer].summary.s, ...(full ? { handshakeSent: true } : {}) });
}

// ─── full copies and backups (docs §3.7, §4.1) ───────────────────────────────

export const FULL_COPY_EXTENSION = ".schplitz";
export const BACKUP_EVERY_ENTRIES = 20;
export const BACKUP_EVERY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A link with the complete history, including other people's old v1 history: for a
 * new or wiped phone, and for backups. Often longer than a normal link, so it's
 * usually sent as a file.
 */
export async function prepareFullCopy(tally, key, { origin } = {}) {
  await settled(tally);
  return encodeLink(tally, key, { origin, full: true, includeProvisional: true });
}

/** A file holding a full copy. The content is the link itself, so opening it is opening the link. */
export function fullCopyFile(label, url) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tally";
  return new File([url], `schplitz-${slug}${FULL_COPY_EXTENSION}`, { type: "text/plain" });
}

/** Larger than any real full copy; a bigger file is something else picked by mistake. */
export const MAX_FILE_BYTES = 10_000_000;

/** Reads a full-copy file (or any text holding a link) and returns the link. Throws "not-a-link" or "too-large". */
export async function linkFromFile(file) {
  const found = await readLinkFile(file);
  if (found.kind !== "link") throw new SchplitzError("not-a-link", "This isn't a Schplitz link, or part of it is missing.");
  return found.url;
}

/**
 * Reads a file someone opened: a Schplitz 2 full copy ({ kind: "link", url }), or an old
 * Schplitz 1 link or text export ({ kind: "old", share }). Throws "not-a-link" or "too-large".
 */
export async function readLinkFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new SchplitzError("too-large", "That file is too big to be a Schplitz full copy.");
  const text = (await file.text()).trim();
  if (text.includes("#share=") || text.startsWith("{")) return { kind: "old", share: await readV1Share(text) };
  readHeader(text);   // throws SchplitzError("not-a-link") for anything else
  return { kind: "link", url: text };
}

/** How much this phone holds, for deciding when a backup is due. */
const entryCount = (tally) => allEntries(tally).length;

/**
 * Whether to suggest saving a backup (Safari only, docs §4.1): after 20 new entries,
 * or 30 days after the last backup when anything changed since.
 */
export function backupDue(tally, now = Date.now()) {
  const last = tally.local?.lastBackup ?? { entries: 0, at: tally.local?.firstSeen ?? now };
  const added = entryCount(tally) - last.entries;
  return added >= BACKUP_EVERY_ENTRIES || (added > 0 && now - last.at >= BACKUP_EVERY_MS);
}

/** Call after a backup was saved or shared. */
export const markBackedUp = (cache, tally) => save(cache, tally, { lastBackup: { entries: entryCount(tally), at: Date.now() } });

// ─── old Schplitz 1 links (migration doc, step 5) ────────────────────────────

const sameNames = (a, b) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/** This phone's converted tally an old link belongs to (same question and names), or null. */
export async function tallyForOldLink(cache, share) {
  const all = await cache.listTallies();
  return all.find(t => t.v1 && t.question === share.question && sameNames(t.members.map(m => m.name), share.names)) ?? null;
}

/**
 * Opens an old Schplitz 1 link (or text export) with the answer. `myName` is only needed
 * when this phone has no tally for it yet. Returns { outcome, tally, key }:
 *   created     a new tally was made from the link
 *   updated     the other person's old entries were refreshed from a newer link
 *   up-to-date  their own version has already arrived in Schplitz 2; the link changes nothing
 *   older       the link is older than what this phone has; nothing changed
 * Throws "cannot-decrypt" for a wrong answer, and "answer-mismatch" when the link opens but
 * this phone's tally was brought in with a different answer.
 */
export async function openOldLink(cache, share, { answer, myName, rateFor }) {
  const opened = await openV1Share(share, answer);
  const match = await tallyForOldLink(cache, share);
  if (match) {
    const r = await applyV1Share(match, opened, { answer, rateFor });
    if (r.outcome === "different-tally")
      throw new SchplitzError("answer-mismatch", "This old link opens with a different answer than the one you used for this tally.");
    await save(cache, match);
    return { outcome: r.outcome, tally: match, key: await cache.loadKey(match.id) };
  }
  if (!share.names.includes(myName)) throw new SchplitzError("invalid-input", "Pick which name is yours.");
  const r = await applyV1Share(null, opened, { myName, answer, rateFor });
  withLocal(r.tally);
  await cache.saveTallyWithKey(r.tally, r.key);
  return { outcome: "created", tally: r.tally, key: r.key };
}

export { readV1Share as readOldLink };

// ─── v1 data on this phone ───────────────────────────────────────────────────

/**
 * What v1 left on this phone: null if nothing convertible, else
 * { question, names, needsAnswer, converted, tallyId }. `converted` is only true while
 * the converted tally is still on this phone, so it can always be brought in again.
 */
export async function v1Status(cache, storage = globalThis.localStorage) {
  const raw = storage?.getItem(V1_STORAGE_KEY);
  const read = readV1Storage(raw);
  if (read.kind !== "A1" && read.kind !== "A2") return null;
  const done = await cache.getMeta("v1Converted");
  return {
    question: read.data.question, names: read.data.names, myName: read.data.myName,
    needsAnswer: !read.answer,
    converted: done?.fingerprint === await fingerprint(raw) && Boolean(await cache.loadTally(done.tallyId)),
    tallyId: done?.tallyId ?? null,
  };
}

/**
 * Converts (or brings in again) the v1 tally on this phone. Leaves the v1 data in
 * place, except for removing a plain-text answer. Returns { tally, key, added, existing }.
 */
export async function convertDeviceV1(cache, { answer, storage = globalThis.localStorage, rateFor } = {}) {
  const raw = storage.getItem(V1_STORAGE_KEY);
  const result = await convertFromDevice(raw, { answer, rateFor });
  if (result.needsAnswer) throw new SchplitzError("invalid-input", "Type the answer to bring this tally in.");
  if (!result.tally) throw new SchplitzError("not-found", "There's no Schplitz 1 tally on this phone.");

  // Bringing it in again with a different answer would derive a different tally: refuse.
  const done = await cache.getMeta("v1Converted");
  if (done?.tallyId && done.tallyId !== result.tally.id && await cache.loadTally(done.tallyId))
    throw new SchplitzError("answer-mismatch", "That's not the answer you used last time for this tally.");

  let { tally, key } = result, added = 0, existing = false;
  const cached = await cache.loadTally(tally.id);
  if (cached) {
    existing = true;
    ({ added } = await reimportFromDevice(cached, raw, { rateFor }));
    tally = cached;
    key = (await cache.loadKey(tally.id)) ?? key;
    await cache.saveTallyWithKey(withLocal(tally), key);
  } else {
    await cache.saveTallyWithKey(withLocal(tally), key);
  }
  if (result.scrubbedStorage) storage.setItem(V1_STORAGE_KEY, result.scrubbedStorage);
  await cache.setMeta("v1Converted", { fingerprint: await fingerprint(storage.getItem(V1_STORAGE_KEY)), tallyId: tally.id });
  return { tally, key, added, existing };
}
