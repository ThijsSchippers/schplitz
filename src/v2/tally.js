// Schplitz v2 prototype — tally model (docs/v2.0.md §3; field reference in schema.js).
//
// A tally is a set of writers: one device acting for one member. Each writer has an
// append-only log and a running summary of it. Balances are the sum of all summaries,
// so any link that carries every summary gives the exact balance, in any order.
//
// Functions mutate the tally object in place. Writes are queued per tally, so rapid
// taps can't produce two entries with the same sequence number. UI code should keep
// a version counter or a clone in its state rather than this object itself.
//
// Trust model: everyone who knows the answer can produce links, and summaries are
// trusted as received (they can't be signed without exceeding the link budget). A
// phone does detect a forged summary for its own writer, and `verify` detects any
// summary that doesn't match a complete log on this phone. See docs/v2.0.md §8.

import { CATEGORIES, OTHER, isCategory } from "./categories.js";
import { localDayNumber, randomHex, toHex, utf8 } from "./encoding.js";
import {
  SchplitzError, MAX_MEMBERS, QUERY_REASONS, TALLY_ID, checkName, checkQuestion, checkPayload,
  isCurrency, isMoney, isDay, isParticipants, FLAG_LEGACY, FLAG_PROVISIONAL,
} from "./schema.js";

export { MAX_MEMBERS, QUERY_REASONS };
export const ABOUT_EVEN  = 500;   // €5 in minor units; for another tally currency, converted once at creation
export const WINDOW_DAYS = 30;    // entries written in the last 30 days travel in every link
export const WINDOW_MIN  = 20;    // …and always at least the last 20

/** Today's day number in the phone's own calendar. */
export const dayNumber = localDayNumber;

const EMPTY_HASH = "0".repeat(16);
export const emptySummary = () => ({ s: 0, h: EMPTY_HASH, n: {}, c: {} });

const invalid = (message) => new SchplitzError("invalid-input", message);
const notAllowed = (message) => new SchplitzError("not-allowed", message);
const notFound = (message) => new SchplitzError("not-found", message);

/**
 * @typedef {object} Summary   see schema.js
 * @typedef {object} Entry     see schema.js
 * @typedef {object} Writer
 * @property {string} member
 * @property {Summary} summary
 * @property {boolean} [legacy]       holds converted v1 history; never written to after conversion
 * @property {boolean} [provisional]  this phone's copy of someone else's v1 history
 * @typedef {object} Tally
 * @property {string} id              32 hex chars
 * @property {string} question
 * @property {string} currency        ISO 4217
 * @property {number} aboutEven       minor units
 * @property {{id: string, name: string}[]} members
 * @property {{member: string, writer: string}} me
 * @property {Record<string, Writer>} writers
 * @property {Record<string, Record<number, Entry>>} logs   per writer, keyed by seq
 * @property {object} [v1]            details kept from a v1 conversion (migrate.js)
 */

// ─── logs ────────────────────────────────────────────────────────────────────

/** A writer's entries in sequence order (integer keys iterate in ascending order). */
export const logOf = (tally, w) => Object.values(tally.logs[w] ?? {});
export const entryOf = (tally, w, s) => tally.logs[w]?.[s] ?? null;
export const allEntries = (tally) => Object.values(tally.logs).flatMap(log => Object.values(log));
const putEntry = (tally, e) => { (tally.logs[e.w] ??= {})[e.s] = e; };

/** Replaces a writer's entries (used when converting or replacing v1 history). */
export function replaceLog(tally, w, entries) {
  tally.logs[w] = {};
  for (const e of entries) putEntry(tally, e);
}

const memberSet = (tally) => new Set(tally.members.map(m => m.id));

// ─── creating and joining ────────────────────────────────────────────────────

/** @returns {Tally} */
export function createTally({ question, currency = "EUR", names: rawNames, me: rawMe, aboutEven = ABOUT_EVEN }) {
  checkQuestion(question);
  if (!Array.isArray(rawNames) || rawNames.length < 2) throw invalid("A tally needs at least 2 members");
  rawNames.forEach(checkName);
  const names = rawNames.map(n => n.trim()), me = String(rawMe).trim();
  if (names.length > MAX_MEMBERS) throw invalid(`A tally has at most ${MAX_MEMBERS} members`);
  if (new Set(names).size !== names.length) throw invalid("Member names must be unique when creating a tally");
  if (!names.includes(me)) throw invalid("'me' must be one of the names");
  if (!isCurrency(currency)) throw invalid("Unknown currency");
  if (!Number.isSafeInteger(aboutEven) || aboutEven < 0) throw invalid("Invalid 'about even' threshold");
  const members = names.map(name => ({ id: randomHex(4), name }));
  const member = members.find(m => m.name === me).id;
  const writer = randomHex(4);
  return {
    id: randomHex(16), question, currency, aboutEven, members,
    me: { member, writer },
    writers: { [writer]: { member, summary: emptySummary() } },
    logs: {},
  };
}

/**
 * A phone that receives a link for a tally it doesn't have: a new member joining,
 * or a returning member whose phone lost its data. Either way it gets a new writer.
 * `returning` is true when this member already has history in the tally.
 */
export function joinTally(header, payload, myMemberId) {
  if (!TALLY_ID.test(header.tallyId)) throw invalid("Invalid tally ID");
  checkPayload(payload);
  if (!payload.m.some(([id]) => id === myMemberId)) throw notFound("Unknown member");
  const tally = {
    id: header.tallyId, question: header.question, currency: payload.cur, aboutEven: payload.ae,
    members: [], me: { member: myMemberId, writer: randomHex(4) }, writers: {}, logs: {},
  };
  tally.writers[tally.me.writer] = { member: myMemberId, summary: emptySummary() };
  const report = mergePayload(tally, payload);
  const returning = Object.entries(tally.writers)
    .some(([w, x]) => w !== tally.me.writer && x.member === myMemberId && x.summary.s > 0 && !x.legacy);
  return { tally, returning, report };
}

// ─── money ───────────────────────────────────────────────────────────────────

/**
 * Equal split in integer minor units. Remainder cents go to participants in
 * sorted-ID order, so every phone computes exactly the same shares.
 */
export function split(value, participants) {
  const ids = [...participants].sort();
  const base = Math.floor(value / ids.length);
  let rest = value - base * ids.length;
  const shares = {};
  for (const id of ids) { shares[id] = base + (rest > 0 ? 1 : 0); if (rest > 0) rest--; }
  return shares;
}

/** Net effect of one payment: the payer is credited, every participant is charged their share. */
export function payEffect(payer, value, participants) {
  const nets = {};
  if (!participants.length || value === 0) return nets;
  addNets(nets, { [payer]: value });
  for (const [id, share] of Object.entries(split(value, participants))) addNets(nets, { [id]: -share });
  return nets;
}

function addNets(into, from, sign = 1) {
  for (const [id, v] of Object.entries(from)) {
    into[id] = (into[id] || 0) + sign * v;
    if (into[id] === 0) delete into[id];
  }
  return into;
}

function addCategory(c, k, count, total) {
  const [c0, t0] = c[k] || [0, 0];
  if (c0 + count === 0 && t0 + total === 0) delete c[k]; else c[k] = [c0 + count, t0 + total];
}

// ─── hashing ─────────────────────────────────────────────────────────────────

/** JSON with sorted keys, so the same entry hashes the same on every phone. */
export const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
  : JSON.stringify(v);

async function chain(prev, entry) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(prev + canonical(entry)));
  return toHex(new Uint8Array(digest).subarray(0, 8));
}

// ─── folding a log into its summary ──────────────────────────────────────────

const PAY_FIELDS = ["k", "a", "c", "v", "p", "pd"];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(o, k)).map(k => [k, o[k]]));

/** Effective state of a writer's payments after its own edits and voids, by seq. */
export function effectivePays(log) {
  const pays = new Map();
  for (const e of log) {
    if (e.t === "pay") pays.set(e.s, { ...e });
    else if (e.t === "edit" && pays.has(e.r)) Object.assign(pays.get(e.r), pick(e.ch, PAY_FIELDS));
    else if (e.t === "void") pays.delete(e.r);
  }
  return pays;
}

/** The day a payment was made (may be earlier than the day it was logged). */
export const paymentDay = (p) => p.pd ?? p.d;

// Net effect and category totals of a whole log. No hashing, so it's cheap enough
// to redo on every write.
function foldNets(member, log) {
  const n = {}, nl = {}, c = {};
  let f;
  for (const e of log) {
    if (e.t === "back") addNets(n, { [e.fr]: e.v, [e.to]: -e.v });
    else if (e.t === "notme") addNets(e.lg ? nl : n, e.n);
    else if (e.t === "resolve" && e.n) addNets(e.lg ? nl : n, e.n, -1);   // the payer takes over the adjustment
    else if (e.t === "recat") for (const [, , v, from] of e.x) { addCategory(c, from, -1, -v); addCategory(c, e.k, 1, v); }
    else if (e.t === "fresh") f = [e.on, e.d, e.s];
  }
  for (const p of effectivePays(log).values()) {
    addNets(n, payEffect(member, p.v, p.p));
    addCategory(c, p.k, 1, p.v);
  }
  return { n, c, ...(Object.keys(nl).length ? { nl } : {}), ...(f ? { f } : {}) };
}

/** Full summary of a complete log, including the hash chain. */
export async function foldLog(member, log) {
  log.forEach((e, i) => { if (e.s !== i + 1) throw new SchplitzError("invalid-payload", `Log has a gap before seq ${e.s}`); });
  let h = EMPTY_HASH;
  for (const e of log) h = await chain(h, e);
  return { s: log.length, h, ...foldNets(member, log) };
}

// ─── writing (always to this phone's own writer) ─────────────────────────────

const queues = new WeakMap();

/** Runs `task` after every earlier write on this tally has finished. */
function queued(tally, task) {
  const run = (queues.get(tally) ?? Promise.resolve()).then(task);
  queues.set(tally, run.catch(() => {}));
  return run;
}

async function append(tally, fields, at) {
  const day = at ?? dayNumber();
  if (!isDay(day)) throw invalid("Invalid day");
  const { writer, member } = tally.me;
  const prev = tally.writers[writer].summary;
  const entry = { w: writer, s: prev.s + 1, d: day, ...fields };
  const h = await chain(prev.h, entry);
  putEntry(tally, entry);
  tally.writers[writer].summary = { s: entry.s, h, ...foldNets(member, logOf(tally, writer)) };
  return entry;
}

function checkPayment(tally, p) {
  if (!isCategory(p.k)) throw invalid("Unknown category");
  if (!isMoney(p.a)) throw invalid("Amount must be a positive whole number of minor units");
  if (!isCurrency(p.c)) throw invalid("Unknown currency");
  if (!isMoney(p.v)) throw invalid("Value in the tally currency is required for a foreign currency");
  if (!isParticipants(p.p, memberSet(tally))) throw invalid("Participants must be distinct members of the tally");
  if (p.pd !== undefined && !isDay(p.pd)) throw invalid("Invalid payment day");
}

function ownPay(tally, seq) {
  const pay = effectivePays(logOf(tally, tally.me.writer)).get(seq);
  if (!pay) throw notAllowed("You can only change your own payments");
  return pay;
}

const refKey = (w, s) => `${w}:${s}`;
const resolvedRefs = (tally) => new Set(allEntries(tally).filter(e => e.t === "resolve").map(e => refKey(...e.r)));

/** "Not me" and "Ask about it" entries the payer hasn't resolved yet. */
export function openDisputes(tally) {
  const resolved = resolvedRefs(tally);
  return allEntries(tally).filter(e => (e.t === "notme" || e.t === "query") && !resolved.has(refKey(e.w, e.s)));
}

const openDisputesOn = (tally, w, s) => openDisputes(tally).filter(d => d.r[0] === w && d.r[1] === s);

const resolveFields = (d, o, { takeOver }) =>
  ({ t: "resolve", r: [d.w, d.s], o, ...(takeOver && d.t === "notme" ? { n: d.n } : {}), ...(d.lg ? { lg: 1 } : {}) });

function doAddPayment(tally, { category, amount, currency, value, participants, paidOn, at, legacyId, estimated }) {
  const day = at ?? dayNumber();
  const c = currency ?? tally.currency;
  const p = {
    k: category, a: amount, c, v: value ?? (c === tally.currency ? amount : undefined),
    p: participants ?? tally.members.map(m => m.id),
    ...(paidOn !== undefined && paidOn !== day ? { pd: paidOn } : {}),
  };
  checkPayment(tally, p);
  return append(tally, { t: "pay", ...p, ...(legacyId ? { l: legacyId } : {}), ...(estimated ? { e: 1 } : {}) }, day);
}

async function doEditPayment(tally, seq, changes, at) {
  const pay = ownPay(tally, seq);
  const ch = pick(changes, PAY_FIELDS);
  const currency = ch.c ?? pay.c;
  if (ch.a !== undefined && ch.v === undefined && currency === tally.currency) ch.v = ch.a;
  if ((ch.c !== undefined || ch.a !== undefined) && currency !== tally.currency && ch.v === undefined)
    throw invalid("Changing a foreign amount needs a new value in the tally currency");
  const changed = Object.fromEntries(Object.entries(ch).filter(([k, v]) => canonical(v) !== canonical(pay[k])));
  if (!Object.keys(changed).length) return null;
  const next = { ...pay, ...changed };
  checkPayment(tally, next);
  const edit = await append(tally, { t: "edit", r: seq, ch: changed }, at);
  // Taking someone out of the split settles their open "Not me": the payer takes over its adjustment.
  for (const d of openDisputesOn(tally, tally.me.writer, seq))
    if (d.t === "notme" && !next.p.includes(tally.writers[d.w].member))
      await append(tally, resolveFields(d, "accepted", { takeOver: true }), at);
  return edit;
}

async function doVoidPayment(tally, seq, at) {
  ownPay(tally, seq);
  const entry = await append(tally, { t: "void", r: seq }, at);
  // A deleted payment can't be disputed: close what's open, taking over any adjustment.
  for (const d of openDisputesOn(tally, tally.me.writer, seq)) await append(tally, resolveFields(d, "voided", { takeOver: true }), at);
  return entry;
}

function doNotMe(tally, [w, s], at) {
  const target = tally.writers[w];
  if (!target) throw notFound("Payment not found on this phone");
  const me = tally.me.member;
  if (target.member === me) throw notAllowed("Use edit for your own payments");
  const pay = paymentState(tally, w, s);
  if (!pay) throw notFound("Payment not found on this phone");
  if (!pay.p.includes(me)) throw notAllowed("You're not part of this payment");
  if (openDisputesOn(tally, w, s).some(d => d.t === "notme" && tally.writers[d.w].member === me))
    throw notAllowed("You're not part of this payment any more (waiting for the payer)");
  const delta = addNets(payEffect(target.member, pay.v, pay.p.filter(id => id !== me)), payEffect(target.member, pay.v, pay.p), -1);
  return append(tally, { t: "notme", r: [w, s], n: delta, ...(target.legacy ? { lg: 1 } : {}) }, at);
}

function doAskAbout(tally, [w, s], reason, at) {
  if (!QUERY_REASONS.includes(reason)) throw invalid("Unknown reason");
  const target = tally.writers[w];
  if (!target || !paymentState(tally, w, s)) throw notFound("Payment not found on this phone");
  if (target.member === tally.me.member) throw notAllowed("You can change your own payments directly");
  return append(tally, { t: "query", r: [w, s], q: reason }, at);
}

// An open dispute on one of my payments. `frozen` when the payment is in a writer
// this phone can't write to (converted v1 history, or a previous phone of mine).
function myOpenDispute(tally, [w, s]) {
  const d = entryOf(tally, w, s);
  if (!d || (d.t !== "notme" && d.t !== "query")) throw notFound("Dispute not found");
  if (tally.writers[d.r[0]]?.member !== tally.me.member) throw notAllowed("Only the payer can resolve this");
  if (resolvedRefs(tally).has(refKey(w, s))) throw notAllowed("Already resolved");
  return { d, frozen: d.r[0] !== tally.me.writer };
}

async function doAcceptDispute(tally, ref, fix, at) {
  const { d, frozen } = myOpenDispute(tally, ref);
  const seq = d.r[1];
  if (d.t === "notme") {
    // A frozen payment can't be edited, so the adjustment stays with the person who raised it.
    if (frozen) return append(tally, resolveFields(d, "accepted", { takeOver: false }), at);
    const out = tally.writers[d.w].member;
    const remaining = ownPay(tally, seq).p.filter(id => id !== out);
    if (!remaining.length) return doVoidPayment(tally, seq, at);
    const edit = await doEditPayment(tally, seq, { p: remaining }, at);   // closes the dispute too
    return edit ?? append(tally, resolveFields(d, "accepted", { takeOver: true }), at);
  }
  const changes = pick(fix, PAY_FIELDS);
  if ((fix.void || Object.keys(changes).length) && frozen) throw notAllowed("Converted v1 entries can't be changed");
  if (fix.void) return doVoidPayment(tally, seq, at);                     // closes the dispute too
  if (Object.keys(changes).length) await doEditPayment(tally, seq, changes, at);
  return append(tally, resolveFields(d, "accepted", { takeOver: false }), at);
}

function doKeepAsIs(tally, ref, at) {
  const { d } = myOpenDispute(tally, ref);
  return append(tally, resolveFields(d, "kept", { takeOver: true }), at);
}

function doRecategorize(tally, refs, category, at) {
  if (!isCategory(category)) throw invalid("Unknown category");
  const x = [];
  const seen = new Set();
  for (const [w, s] of refs) {
    if (seen.has(refKey(w, s))) continue;
    seen.add(refKey(w, s));
    const writer = tally.writers[w];
    if (!writer?.legacy || writer.provisional || writer.member !== tally.me.member) throw notAllowed("You can only sort your own old entries");
    const pay = paymentState(tally, w, s);
    if (!pay) throw notFound("Entry not found");
    const from = categoryOf(tally, w, s);
    if (from !== category) x.push([w, s, pay.v, from]);
  }
  return x.length ? append(tally, { t: "recat", k: category, x }, at) : null;
}

function doAddPaidBack(tally, { from, to, value, at }) {
  const members = memberSet(tally);
  if (from === to || !members.has(from) || !members.has(to)) throw invalid("Paid back needs two different members");
  if (!isMoney(value)) throw invalid("Value must be a positive whole number of minor units");
  return append(tally, { t: "back", fr: from, to, v: value }, at);
}

/**
 * Adds a payment by this phone's member.
 * amount/currency: what was paid. value: the tally-currency amount, with the rate
 * locked now (defaults to amount in the tally currency). paidOn: payment day if not
 * the day of writing. at: day of writing (defaults to today; tests use it to move in time).
 */
export const addPayment = (tally, opts) => queued(tally, () => doAddPayment(tally, opts));
/** Changes one of this phone's payments. `changes` uses payment field names (k a c v p pd). Returns null if nothing changed. */
export const editPayment = (tally, seq, changes, at) => queued(tally, () => doEditPayment(tally, seq, changes, at));
export const voidPayment = (tally, seq, at) => queued(tally, () => doVoidPayment(tally, seq, at));
export const addPaidBack = (tally, opts) => queued(tally, () => doAddPaidBack(tally, opts));
/** "I wasn't there": re-split without me, effective immediately (docs §3.5). */
export const notMe = (tally, ref, at) => queued(tally, () => doNotMe(tally, ref, at));
/** "Ask about it": flags the payment for its payer; changes nothing by itself. */
export const askAbout = (tally, ref, reason, at) => queued(tally, () => doAskAbout(tally, ref, reason, at));
/** Payer agrees. "Not me": that person is taken out. "Ask about it": `fix` is applied ({void: true} or payment fields). */
export const acceptDispute = (tally, ref, fix = {}, at) => queued(tally, () => doAcceptDispute(tally, ref, fix, at));
/** Payer disagrees: the payment stays as it was. */
export const keepAsIs = (tally, ref, at) => queued(tally, () => doKeepAsIs(tally, ref, at));
/** "Start fresh" (migration doc, step 2): converted v1 entries stop counting, or count again. */
export const setFreshStart = (tally, on, at) => queued(tally, () => append(tally, { t: "fresh", on: on ? 1 : 0 }, at));
/** Sorting old entries (migration doc, step 2b): only this member's own converted v1 entries. Returns null if nothing changed. */
export const recategorize = (tally, refs, category, at) => queued(tally, () => doRecategorize(tally, refs, category, at));

// ─── reading ─────────────────────────────────────────────────────────────────

/** Current state of a payment, from the entries this phone has, or null. */
export const paymentState = (tally, w, s) => effectivePays(logOf(tally, w)).get(s) ?? null;

/** Current category of a payment, after any sorting of old entries. */
export function categoryOf(tally, w, s) {
  let k = paymentState(tally, w, s)?.k;
  const recats = allEntries(tally).filter(e => e.t === "recat" && e.x.some(([xw, xs]) => xw === w && xs === s))
    .sort((a, b) => a.d - b.d || (a.w < b.w ? -1 : a.w > b.w ? 1 : a.s - b.s));
  for (const r of recats) k = r.k;
  return k;
}

/** Whether "start fresh" is on: the latest choice by anyone wins (by day, then writer, then seq). */
export function freshStart(tally) {
  let latest = null;
  for (const [w, { summary }] of Object.entries(tally.writers)) {
    if (!summary.f) continue;
    const [on, d, s] = summary.f;
    if (!latest || d > latest.d || (d === latest.d && (w > latest.w || (w === latest.w && s > latest.s)))) latest = { on, d, w, s };
  }
  return Boolean(latest?.on);
}

/** Net position per member in minor units: positive is ahead, negative is behind. Sums to zero. */
export function balance(tally) {
  const nets = {};
  const fresh = freshStart(tally);
  for (const { summary, legacy } of Object.values(tally.writers)) {
    if (!(fresh && legacy)) addNets(nets, summary.n);
    if (!fresh && summary.nl) addNets(nets, summary.nl);
  }
  for (const m of tally.members) nets[m.id] ??= 0;
  return nets;
}

/** Whose turn it is among the people present: the one furthest behind. */
export function whoseTurn(tally, present = tally.members.map(m => m.id)) {
  const members = memberSet(tally);
  if (!present.length || present.some(id => !members.has(id))) throw invalid("Present must be members of the tally");
  const nets = balance(tally);
  const [member, net] = present.map(id => [id, nets[id]]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { member, net, aboutEven: Math.abs(net) < tally.aboutEven };
}

/** Per category: [number of payments, total value], over everyone's history. */
export function categoryTotals(tally) {
  const totals = {};
  for (const { summary } of Object.values(tally.writers))
    for (const [k, [count, sum]] of Object.entries(summary.c)) addCategory(totals, k, count, sum);
  return totals;
}

/** Suggested amount on the logging screen. Prototype: lifetime average per category. */
export function usualAmount(tally, category) {
  if (!CATEGORIES[category]?.prefill) return null;
  const t = categoryTotals(tally)[category];
  return t && t[0] > 0 ? Math.round(t[1] / t[0]) : null;
}

/** "About 2 rounds of drinks": the most-used category that expresses the amount in 1–5 units. */
export function socialUnits(tally, amount) {
  const best = Object.entries(categoryTotals(tally))
    .filter(([k, [count, sum]]) => Number(k) !== OTHER && count > 0 && sum > 0)
    .map(([k, [count, sum]]) => ({ category: Number(k), count, units: Math.round(Math.abs(amount) / (sum / count)) }))
    .filter(o => o.units >= 1 && o.units <= 5)
    .sort((a, b) => b.count - a.count || a.category - b.category)[0];
  return best ? { category: best.category, units: best.units } : null;
}

// ─── combining what a link brings ────────────────────────────────────────────

const summaryFrom = ({ s, h, n, nl, c, f }) => ({ s, h, n, c, ...(nl ? { nl } : {}), ...(f ? { f } : {}) });
const v1Ids = (entries) => new Set(entries.map(e => e.l).filter(Boolean));

/**
 * Merges a decrypted link payload into the tally. Validates it first.
 * Summaries: per writer, the highest seq wins. Entries: added if new.
 * Converted v1 history: provisional copies never override; the owner's version
 * replaces a provisional copy.
 *
 * @returns report: newEntries, involvingMe (new payments that include me),
 *   replaced (v1 copies replaced: added/removed v1 IDs), review (my v1 entries the
 *   sender lacked, or that the sender has but I deleted), conflicts.
 */
export function mergePayload(tally, payload) {
  checkPayload(payload);
  const newMembers = payload.m.filter(([id]) => !tally.members.some(m => m.id === id));
  if (tally.members.length + newMembers.length > MAX_MEMBERS) throw new SchplitzError("invalid-payload", "Too many members");
  for (const [id, name] of newMembers) tally.members.push({ id, name });

  const report = { newEntries: [], involvingMe: [], conflicts: [], replaced: [], review: [] };
  const skip = new Set();
  const incomingV1Ids = (w) => new Set(payload.pl?.[w] ?? v1Ids(payload.e.filter(e => e.w === w)));
  for (const [w, x] of Object.entries(payload.w)) {
    const incoming = summaryFrom(x);
    const legacy = Boolean(x.fl & FLAG_LEGACY), provisional = Boolean(x.fl & FLAG_PROVISIONAL);
    const known = tally.writers[w];

    if (!known) { tally.writers[w] = { member: x.m, summary: incoming, legacy, provisional }; continue; }
    if (known.member !== x.m) {
      report.conflicts.push({ writer: w, reason: "writer claimed by another member" });
      skip.add(w);
      continue;
    }
    if (w === tally.me.writer) {
      if (x.s > known.summary.s) report.conflicts.push({ writer: w, reason: "someone else wrote as this phone" });
      skip.add(w);
      continue;
    }
    if (provisional) {
      // Someone's copy of an old v1 history never overrides what this phone has.
      skip.add(w);
      if (!known.provisional && known.member === tally.me.member) {
        const mine = v1Ids(logOf(tally, w)), theirs = incomingV1Ids(w);
        report.review.push({ writer: w,
          theyMiss: [...mine].filter(l => !theirs.has(l)),     // kept; ask me to confirm
          iDeleted: [...theirs].filter(l => !mine.has(l)) });  // stays deleted
      }
      continue;
    }
    if (known.provisional) {
      skip.add(w);
      if (x.h === known.summary.h && x.s === known.summary.s) {
        // The owner's version is exactly this phone's copy (e.g. they adopted it): keep the entries.
        known.provisional = false;
        report.replaced.push({ writer: w, added: [], removed: [] });
        continue;
      }
      // The owner's own version of an old v1 history replaces this phone's copy.
      const before = v1Ids(logOf(tally, w)), after = incomingV1Ids(w);
      replaceLog(tally, w, payload.e.filter(e => e.w === w));
      tally.writers[w] = { member: x.m, summary: incoming, legacy, provisional: false };
      report.replaced.push({ writer: w, added: [...after].filter(l => !before.has(l)), removed: [...before].filter(l => !after.has(l)) });
      continue;
    }
    if (x.s > known.summary.s) known.summary = incoming;
    else if (x.s === known.summary.s && x.h !== known.summary.h) report.conflicts.push({ writer: w, reason: "two different histories" });
  }

  for (const e of payload.e) {
    if (skip.has(e.w) || entryOf(tally, e.w, e.s)) continue;
    putEntry(tally, e);
    report.newEntries.push(e);
  }
  report.involvingMe = report.newEntries.filter(e => {
    const writer = tally.writers[e.w];
    return e.t === "pay" && !writer.legacy && writer.member !== tally.me.member &&
      paymentState(tally, e.w, e.s)?.p.includes(tally.me.member);
  });
  return report;
}

/** A phone that lost its v1 data takes over the other person's copy of its own v1 history. */
export function adoptProvisional(tally, w) {
  const writer = tally.writers[w];
  if (!writer?.provisional || writer.member !== tally.me.member) throw notFound("Nothing to adopt");
  writer.provisional = false;
}

/**
 * For every writer whose complete log is on this phone, recomputes its summary and
 * compares it with the one held. Returns the writers that don't match: a bug,
 * corruption, or a forged summary. A writer using entry types from a newer app
 * version can also show up here, because this version ignores those entries.
 */
export async function verify(tally) {
  const problems = [];
  for (const [w, { member, summary }] of Object.entries(tally.writers)) {
    const log = logOf(tally, w);
    if (!log.length || log.length !== summary.s || log[log.length - 1].s !== summary.s) continue;
    const ours = await foldLog(member, log);
    if (canonical(summaryFrom(ours)) !== canonical(summaryFrom(summary))) problems.push(w);
  }
  return problems;
}
