// Schplitz tally model (docs/v2.0.md §3; field reference in schema.js).
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

import { isCategory } from "./categories.js";
import { localDayNumber, randomHex } from "./encoding.js";
import {
  SchplitzError, MAX_MEMBERS, QUERY_REASONS, TALLY_ID, checkName, checkQuestion, checkPayload,
  isCurrency, isMoney, isDay, isParticipants,
} from "./schema.js";

import {
  emptySummary, logOf, entryOf, allEntries, putEntry, effectivePays, paymentState,
  payEffect, addNets, canonical, chain, foldNets, paymentChanges,
} from "./tally/log.js";
import { categoryOf, tallyName } from "./tally/views.js";
import { mergePayload } from "./tally/merge.js";

// Keep this public entry point stable for screens, links, migration, and tests.
export { emptySummary, logOf, entryOf, allEntries, replaceLog, split, payEffect,
  canonical, effectivePays, paymentDay, foldLog, paymentState } from "./tally/log.js";
export { categoryOf, freshStart, tallyName, balance, whoseTurn, categoryTotals,
  usualAmount, socialUnits } from "./tally/views.js";
export { mergePayload, verify } from "./tally/merge.js";

export { MAX_MEMBERS, QUERY_REASONS };
export const ABOUT_EVEN  = 500;   // €5 in minor units; for another tally currency, converted once at creation
export const WINDOW_DAYS = 30;    // entries written in the last 30 days travel in every link
export const WINDOW_MIN  = 20;    // …and always at least the last 20

/** Today's day number in the phone's own calendar. */
export const dayNumber = localDayNumber;

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

const memberSet = (tally) => new Set(tally.members.map(m => m.id));

// ─── creating and joining ────────────────────────────────────────────────────

/** @returns {Tally} */
export function createTally({ question, currency = "EUR", names: rawNames, me: rawMe, aboutEven = ABOUT_EVEN }) {
  checkQuestion(question);
  if (!Array.isArray(rawNames) || rawNames.length < 2) throw invalid("A tally needs at least 2 members");
  rawNames.forEach(checkName);
  const names = rawNames.map(n => n.trim()), me = String(rawMe).trim();
  if (names.length > MAX_MEMBERS) throw invalid(`A tally can have up to ${MAX_MEMBERS} people.`);
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

// ─── writing (always to this phone's own writer) ─────────────────────────────

const queues = new WeakMap();

/** Runs `task` after every earlier write on this tally has finished. */
function queued(tally, task) {
  const run = (queues.get(tally) ?? Promise.resolve()).then(task);
  queues.set(tally, run.catch(() => {}));
  return run;
}

/** Resolves once every write started so far on this tally has finished (successfully or not). */
export const settled = (tally) => queues.get(tally) ?? Promise.resolve();

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
  if (!isCategory(p.k)) throw invalid("Pick a category.");
  if (!isMoney(p.a)) throw invalid("Enter an amount above zero.");
  if (!isCurrency(p.c)) throw invalid("Unknown currency.");
  if (!isMoney(p.v)) throw invalid("Value in the tally currency is required for a foreign currency");   // a bug if it happens
  if (!isParticipants(p.p, memberSet(tally))) throw invalid("Pick who was there.");
  if (p.pd !== undefined && !isDay(p.pd)) throw invalid("Invalid payment day");
}

function ownPay(tally, seq) {
  const pay = effectivePays(logOf(tally, tally.me.writer)).get(seq);
  if (!pay) throw notAllowed("You can only change your own payments.");
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
  const ch = paymentChanges(changes);
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
  if (!target) throw notFound("This payment isn't on this phone.");
  const me = tally.me.member;
  if (target.member === me) throw notAllowed("It's your own payment. Change it instead.");
  const pay = paymentState(tally, w, s);
  if (!pay) throw notFound("This payment isn't on this phone.");
  if (!pay.p.includes(me)) throw notAllowed("You're not part of this payment.");
  if (openDisputesOn(tally, w, s).some(d => d.t === "notme" && tally.writers[d.w].member === me))
    throw notAllowed("You already said you weren't there.");
  const delta = addNets(payEffect(target.member, pay.v, pay.p.filter(id => id !== me)), payEffect(target.member, pay.v, pay.p), -1);
  return append(tally, { t: "notme", r: [w, s], n: delta, ...(target.legacy ? { lg: 1 } : {}) }, at);
}

function doAskAbout(tally, [w, s], reason, at) {
  if (!QUERY_REASONS.includes(reason)) throw invalid("Unknown reason");
  const target = tally.writers[w];
  if (!target || !paymentState(tally, w, s)) throw notFound("This payment isn't on this phone.");
  if (target.member === tally.me.member) throw notAllowed("It's your own payment. Change it instead.");
  return append(tally, { t: "query", r: [w, s], q: reason }, at);
}

// An open dispute on one of my payments. `frozen` when the payment is in a writer
// this phone can't write to (converted v1 history, or a previous phone of mine).
function myOpenDispute(tally, [w, s]) {
  const d = entryOf(tally, w, s);
  if (!d || (d.t !== "notme" && d.t !== "query")) throw notFound("This question isn't on this phone.");
  if (tally.writers[d.r[0]]?.member !== tally.me.member) throw notAllowed("Only the person who paid can answer this.");
  if (resolvedRefs(tally).has(refKey(w, s))) throw notAllowed("This was already answered.");
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
  const changes = paymentChanges(fix);
  if ((fix.void || Object.keys(changes).length) && frozen) throw notAllowed("Entries from Schplitz 1 can't be changed.");
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
    if (!writer?.legacy || writer.provisional || writer.member !== tally.me.member) throw notAllowed("You can only sort your own old entries.");
    const pay = paymentState(tally, w, s);
    if (!pay) throw notFound("This entry isn't on this phone.");
    const from = categoryOf(tally, w, s);
    if (from !== category) x.push([w, s, pay.v, from]);
  }
  return x.length ? append(tally, { t: "recat", k: category, x }, at) : null;
}

function doAddPaidBack(tally, { from, to, value, at }) {
  const members = memberSet(tally);
  if (from === to || !members.has(from) || !members.has(to)) throw invalid("Pick two different people.");
  if (!isMoney(value)) throw invalid("Enter an amount above zero.");
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
/** Names the tally for everyone; an empty name clears it. Returns null if nothing changed. */
export const renameTally = (tally, name, at) => queued(tally, () => {
  const nm = String(name ?? "").trim();
  if (nm) checkName(nm);
  if (nm === (tallyName(tally) ?? "")) return null;
  return append(tally, { t: "rename", nm }, at);
});

/**
 * Adds someone to the tally. Synchronous: the member list travels in every link and
 * phones combine their lists, so no entry is needed. Save the tally afterwards.
 */
export function addMember(tally, rawName) {
  checkName(rawName);
  const name = rawName.trim();
  if (tally.members.length >= MAX_MEMBERS) throw invalid(`A tally can have up to ${MAX_MEMBERS} people.`);
  if (tally.members.some(m => m.name.toLowerCase() === name.toLowerCase())) throw invalid(`${name} is already in this tally.`);
  const member = { id: randomHex(4), name };
  tally.members.push(member);
  return member;
}

/** Sorting old entries (migration doc, step 2b): only this member's own converted v1 entries. Returns null if nothing changed. */
export const recategorize = (tally, refs, category, at) => queued(tally, () => doRecategorize(tally, refs, category, at));

/** A phone that lost its v1 data takes over the other person's copy of its own v1 history. */
export function adoptProvisional(tally, w) {
  const writer = tally.writers[w];
  if (!writer?.provisional || writer.member !== tally.me.member) throw notFound("Nothing to adopt");
  writer.provisional = false;
}
