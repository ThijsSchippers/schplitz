// Schplitz v2 prototype — data format reference and validation.
//
// Everything that arrives in a link is validated here before it touches a tally.
// The answer is shared, so anyone who knows it can produce a link; malformed data
// must be rejected, not trusted.
//
// ─── Format reference ────────────────────────────────────────────────────────
// Field names are one or two letters because every byte counts in a link.
//
// IDs        member and writer IDs: 8 lowercase hex chars; tally ID: 32.
// Days       whole days since 1970-01-01, in the writer's own calendar.
// Money      integers in minor units (cents). `v` is always in the tally currency.
//
// Entry (every type)
//   w  writer ID        s  sequence number, 1, 2, 3… per writer
//   t  type             d  day the entry was written (drives the correction window)
//
// t = "pay"      a payment by the writer's member
//   k  category code (categories.js)     a  amount paid, in currency c
//   c  currency (ISO 4217)                v  value in the tally currency, rate locked when added
//   p  participant member IDs             pd payment day, only when it differs from d
//   l  v1 expense ID (converted entries)  e  1 when the rate was estimated
// t = "edit"     the writer changes one of its own payments
//   r  seq of the payment                 ch changed fields, any of k a c v p pd
// t = "void"     the writer deletes one of its own payments
//   r  seq of the payment
// t = "back"     a paid-back transfer
//   fr member who paid                    to member who received     v value
// t = "notme"    "I wasn't there" on someone else's payment
//   r  [writer, seq] of the payment       n  net adjustment per member (re-split without me)
//   lg 1 when the payment is a converted v1 entry
// t = "query"    "Ask about it"
//   r  [writer, seq] of the payment       q  reason: amount | date | category | duplicate
// t = "resolve"  the payer closes a notme or query
//   r  [writer, seq] of the notme/query   o  accepted | kept | voided
//   n  adjustment the payer takes over (copied from the notme), if any
//   lg copied from the notme
// t = "recat"    sorting own converted v1 entries
//   k  new category                       x  [[writer, seq, value, previous category], …]
// t = "fresh"    "start fresh": converted v1 entries stop counting
//   on 1 or 0
// t = "rename"   names the tally for everyone
//   nm the name ("" clears it)
// Unknown types (from a newer app version) are kept and ignored.
//
// Summary of one writer's whole log
//   s  last seq      h  hash chain head (16 hex)
//   n  net per member (excluding adjustments tied to converted v1 entries)
//   nl net per member from adjustments tied to converted v1 entries
//   c  per category: [count, total value]
//   f  latest "start fresh" choice: [on, day, seq]
//   tn latest tally name: [name, day, seq]
//
// Payload (inside the encrypted part of a link)
//   cur tally currency   ae "about even" threshold   m [[member ID, name], …]
//   w   { writer ID: { m member, s, h, n, nl?, c, f?, fl flags } }   (flags: 1 legacy, 2 provisional)
//   e   entries          pl { writer ID: [v1 IDs] } (provisional copies sent as ID lists)

import { MAX_NAME_LEN, MAX_QUESTION_LEN } from "../utils.js";

export const MAX_MEMBERS = 10;
export const MAX_WRITERS = 200;               // restored phones each add a writer
export const MAX_ENTRIES = 200_000;
export const MAX_MINOR_UNITS = 100_000_000_000; // 1 billion in a 2-decimal currency
export const MAX_NET = 10_000_000_000_000;      // per value; even summed over MAX_WRITERS it stays below 2^53
export const MAX_SEQ = 10_000_000;
export const MAX_DAY = 200_000;               // year 2517
export { MAX_NAME_LEN, MAX_QUESTION_LEN };

export const QUERY_REASONS = ["amount", "date", "category", "duplicate"];
export const RESOLVE_OUTCOMES = ["accepted", "kept", "voided"];
export const FLAG_LEGACY = 1;
export const FLAG_PROVISIONAL = 2;

export class SchplitzError extends Error {
  /**
   * @param {"invalid-input"|"not-allowed"|"not-found"|"not-a-link"|"unsupported-version"|"cannot-decrypt"|"answer-mismatch"|"invalid-payload"|"too-large"} code
   *   Stable code for the UI to map to a message.
   */
  constructor(code, message) {
    super(message);
    this.name = "SchplitzError";
    this.code = code;
  }
}

const fail = (code, message) => { throw new SchplitzError(code, message); };
const bad = (message) => fail("invalid-payload", message);

const ID = /^[0-9a-f]{8}$/;
const HASH = /^[0-9a-f]{16}$/;
export const TALLY_ID = /^[0-9a-f]{32}$/;
const CURRENCY = /^[A-Z]{3}$/;
const TYPE = /^[a-z]{1,12}$/;

export const isId = (x) => typeof x === "string" && ID.test(x);
const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isInt = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
const has = (o, k) => Object.hasOwn(o, k);

// ─── field validators (shared with the tally's own input checks) ─────────────

export function checkName(name) {
  if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LEN)
    fail("invalid-input", `Names must be 1–${MAX_NAME_LEN} characters`);
}

export function checkQuestion(question) {
  if (typeof question !== "string" || !question.trim() || question.length > MAX_QUESTION_LEN)
    fail("invalid-input", `The question must be 1–${MAX_QUESTION_LEN} characters`);
}

export const isCurrency = (c) => typeof c === "string" && CURRENCY.test(c);
export const isMoney = (v) => isInt(v, 1, MAX_MINOR_UNITS);
export const isDay = (d) => isInt(d, 0, MAX_DAY);
export const isCategoryCode = (k) => isInt(k, 0, 999);

/** Participants: 1+ distinct IDs, all members. */
export function isParticipants(p, memberIds) {
  return Array.isArray(p) && p.length >= 1 && p.length <= MAX_MEMBERS &&
    new Set(p).size === p.length && p.every(id => memberIds.has(id));
}

function checkNets(n, memberIds, what) {
  if (!isObject(n)) bad(`${what}: not an object`);
  for (const [id, v] of Object.entries(n))
    if (!memberIds.has(id) || !isInt(v, -MAX_NET, MAX_NET)) bad(`${what}: bad entry for ${JSON.stringify(id)}`);
}

const isRef = (r, writerIds) => Array.isArray(r) && r.length === 2 && writerIds.has(r[0]) && isInt(r[1], 1, MAX_SEQ);

/** Fields a payment can have, also used for the `ch` of an edit. */
function checkPayFields(f, memberIds, what, { partial }) {
  const need = (k) => !partial || has(f, k);
  if (need("k") && !isCategoryCode(f.k)) bad(`${what}: category`);
  if (need("a") && !isMoney(f.a)) bad(`${what}: amount`);
  if (need("c") && !isCurrency(f.c)) bad(`${what}: currency`);
  if (need("v") && !isMoney(f.v)) bad(`${what}: value`);
  if (need("p") && !isParticipants(f.p, memberIds)) bad(`${what}: participants`);
  if (has(f, "pd") && !isDay(f.pd)) bad(`${what}: payment day`);
}

export function checkEntry(e, memberIds, writerIds) {
  if (!isObject(e)) bad("entry: not an object");
  const what = `entry ${e.w}:${e.s}`;
  if (!isId(e.w) || !writerIds.has(e.w)) bad("entry: unknown writer");
  if (!isInt(e.s, 1, MAX_SEQ)) bad(`${what}: seq`);
  if (!isDay(e.d)) bad(`${what}: day`);
  if (typeof e.t !== "string" || !TYPE.test(e.t)) bad(`${what}: type`);
  switch (e.t) {
    case "pay":
      checkPayFields(e, memberIds, what, { partial: false });
      if (has(e, "l") && (typeof e.l !== "string" || e.l.length > 40)) bad(`${what}: v1 ID`);
      if (has(e, "e") && e.e !== 1) bad(`${what}: estimated flag`);
      break;
    case "edit":
      if (!isInt(e.r, 1, MAX_SEQ) || !isObject(e.ch)) bad(`${what}: edit`);
      if (Object.keys(e.ch).some(k => !["k", "a", "c", "v", "p", "pd"].includes(k))) bad(`${what}: edit field`);
      checkPayFields(e.ch, memberIds, what, { partial: true });
      break;
    case "void":
      if (!isInt(e.r, 1, MAX_SEQ)) bad(`${what}: void`);
      break;
    case "back":
      if (!memberIds.has(e.fr) || !memberIds.has(e.to) || e.fr === e.to || !isMoney(e.v)) bad(`${what}: paid back`);
      break;
    case "notme":
      if (!isRef(e.r, writerIds)) bad(`${what}: reference`);
      checkNets(e.n, memberIds, what);
      if (has(e, "lg") && e.lg !== 1) bad(`${what}: flag`);
      break;
    case "query":
      if (!isRef(e.r, writerIds) || !QUERY_REASONS.includes(e.q)) bad(`${what}: query`);
      break;
    case "resolve":
      if (!isRef(e.r, writerIds) || !RESOLVE_OUTCOMES.includes(e.o)) bad(`${what}: resolve`);
      if (has(e, "n")) checkNets(e.n, memberIds, what);
      if (has(e, "lg") && e.lg !== 1) bad(`${what}: flag`);
      break;
    case "recat":
      if (!isCategoryCode(e.k) || !Array.isArray(e.x) || !e.x.length || e.x.length > MAX_ENTRIES) bad(`${what}: recat`);
      for (const x of e.x)
        if (!Array.isArray(x) || x.length !== 4 || !writerIds.has(x[0]) || !isInt(x[1], 1, MAX_SEQ) || !isMoney(x[2]) || !isCategoryCode(x[3]))
          bad(`${what}: recat item`);
      break;
    case "fresh":
      if (e.on !== 0 && e.on !== 1) bad(`${what}: fresh`);
      break;
    case "rename":
      if (typeof e.nm !== "string" || e.nm.length > MAX_NAME_LEN) bad(`${what}: name`);
      break;
    default:
      // A newer app version's entry type: kept and ignored.
  }
}

function checkSummary(w, x, memberIds) {
  const what = `writer ${w}`;
  if (!isObject(x) || !memberIds.has(x.m)) bad(`${what}: member`);
  if (!isInt(x.s, 1, MAX_SEQ) || typeof x.h !== "string" || !HASH.test(x.h)) bad(`${what}: seq or hash`);
  checkNets(x.n, memberIds, `${what} nets`);
  if (has(x, "nl")) checkNets(x.nl, memberIds, `${what} v1 nets`);
  if (!isObject(x.c)) bad(`${what}: categories`);
  for (const [k, t] of Object.entries(x.c))
    if (!/^\d{1,3}$/.test(k) || !Array.isArray(t) || t.length !== 2 || !isInt(t[0], -MAX_ENTRIES, MAX_ENTRIES) || !isInt(t[1], -MAX_NET, MAX_NET))
      bad(`${what}: category ${JSON.stringify(k)}`);
  if (has(x, "f") && !(Array.isArray(x.f) && x.f.length === 3 && (x.f[0] === 0 || x.f[0] === 1) && isDay(x.f[1]) && isInt(x.f[2], 1, MAX_SEQ)))
    bad(`${what}: fresh start`);
  if (has(x, "fl") && !isInt(x.fl, 0, FLAG_LEGACY | FLAG_PROVISIONAL)) bad(`${what}: flags`);
  if (has(x, "tn") && !(Array.isArray(x.tn) && x.tn.length === 3 && typeof x.tn[0] === "string" && x.tn[0].length <= MAX_NAME_LEN && isDay(x.tn[1]) && isInt(x.tn[2], 1, MAX_SEQ)))
    bad(`${what}: tally name`);
}

/** Validates a decrypted payload. Throws SchplitzError("invalid-payload") on anything unexpected. */
export function checkPayload(p) {
  if (!isObject(p)) bad("payload: not an object");
  if (!isCurrency(p.cur) || !isInt(p.ae, 0, MAX_MINOR_UNITS)) bad("payload: currency or threshold");
  if (!Array.isArray(p.m) || p.m.length < 2 || p.m.length > MAX_MEMBERS) bad("payload: members");
  for (const m of p.m) {
    if (!Array.isArray(m) || m.length !== 2 || !isId(m[0])) bad("payload: member");
    try { checkName(m[1]); } catch { bad("payload: member name"); }
  }
  const memberIds = new Set(p.m.map(m => m[0]));
  if (memberIds.size !== p.m.length) bad("payload: duplicate member");

  if (!isObject(p.w)) bad("payload: writers");
  const writerIds = Object.keys(p.w);
  if (writerIds.length > MAX_WRITERS || writerIds.some(w => !isId(w))) bad("payload: writer IDs");
  for (const w of writerIds) checkSummary(w, p.w[w], memberIds);

  if (!Array.isArray(p.e) || p.e.length > MAX_ENTRIES) bad("payload: entries");
  const ids = new Set(writerIds);
  for (const e of p.e) {
    checkEntry(e, memberIds, ids);
    if (e.s > p.w[e.w].s) bad(`entry ${e.w}:${e.s}: beyond its writer's summary`);
  }
  if (has(p, "pl")) {
    if (!isObject(p.pl)) bad("payload: v1 ID lists");
    for (const [w, list] of Object.entries(p.pl))
      if (!ids.has(w) || !Array.isArray(list) || list.length > MAX_ENTRIES || list.some(l => typeof l !== "string" || l.length > 40))
        bad("payload: v1 ID list");
  }
  return p;
}
