// Schplitz v2 — what the screens do, without React: the glue between the tally
// model, links, the phone's cache and v1 conversion. Every function that changes a
// tally also saves it to the cache.

import { createTally, joinTally, mergePayload, addPayment, dayNumber, settled } from "./tally.js";
import { deriveKey, encodeLink, decodeLink, readHeader } from "./link.js";
import { V1_STORAGE_KEY, convertFromDevice, defaultRate, fingerprint, looksLikeMismatchedAnswer, readV1Storage, reimportFromDevice } from "./migrate.js";
import { emptyLocal } from "./cache.js";
import { SchplitzError } from "./schema.js";
import { decimalsOf, isoOfDay, toMinorUnits } from "./encoding.js";

/** How long a currency other than the tally's stays selected after it was used (docs §6.2.3). */
export const STICKY_CURRENCY_MS = 12 * 60 * 60 * 1000;

const withLocal = (tally, changes = {}) => {
  tally.local = { ...emptyLocal(), ...tally.local, lastSeen: Date.now(), ...changes };
  return tally;
};

/** Saves a tally after a change made with the tally.js functions. */
export async function save(cache, tally, localChanges) {
  withLocal(tally, localChanges);
  await cache.saveTally(tally);
  return tally;
}

// ─── starting and joining ────────────────────────────────────────────────────

/** Creates a tally and caches it with its key. The answer is normalised like v1's. */
export async function startTally(cache, { question, answer, myName, friendNames, currency }) {
  const tally = createTally({ question, names: [myName, ...friendNames], me: myName, currency });
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
      throw new SchplitzError("answer-mismatch", "This looks like your old tally, but your answers don't match");
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

/** Records a payment by me, locks its rate, and remembers the currency for the next one. */
export async function recordPayment(cache, tally, { category, amount, currency, paidOn = dayNumber(), rateFor }) {
  const { value, estimated } = await valueInTallyCurrency(tally, amount, currency, paidOn, rateFor);
  const entry = await addPayment(tally, { category, amount, currency, value, paidOn, estimated });
  // Paying in the tally currency again ends the 12 hours of a foreign one.
  await save(cache, tally, { lastCurrency: currency === tally.currency ? null : { c: currency, at: Date.now() } });
  return entry;
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
  if (result.needsAnswer) throw new SchplitzError("invalid-input", "The answer is needed to bring this tally in");
  if (!result.tally) throw new SchplitzError("not-found", "No Schplitz 1 tally on this phone");

  // Bringing it in again with a different answer would derive a different tally: refuse.
  const done = await cache.getMeta("v1Converted");
  if (done?.tallyId && done.tallyId !== result.tally.id && await cache.loadTally(done.tallyId))
    throw new SchplitzError("answer-mismatch", "That answer doesn't match the one you used before");

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
