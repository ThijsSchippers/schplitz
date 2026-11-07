// Writer logs, integer splits, and deterministic summary calculations.
import { toHex, utf8 } from "../encoding.js";
import { SchplitzError } from "../schema.js";

const EMPTY_HASH = "0".repeat(16);
export const emptySummary = () => ({ s: 0, h: EMPTY_HASH, n: {}, c: {} });

/** A writer's entries in sequence order (integer keys iterate in ascending order). */
export const logOf = (tally, writerId) => Object.values(tally.logs[writerId] ?? {});
export const entryOf = (tally, writerId, sequence) => tally.logs[writerId]?.[sequence] ?? null;
export const allEntries = (tally) => Object.values(tally.logs).flatMap(log => Object.values(log));
export const putEntry = (tally, entry) => { (tally.logs[entry.w] ??= {})[entry.s] = entry; };

/** Replaces a writer's entries (used when converting or replacing v1 history). */
export function replaceLog(tally, writerId, entries) {
  tally.logs[writerId] = {};
  for (const entry of entries) putEntry(tally, entry);
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

export function addNets(into, from, sign = 1) {
  for (const [id, v] of Object.entries(from)) {
    into[id] = (into[id] || 0) + sign * v;
    if (into[id] === 0) delete into[id];
  }
  return into;
}

export function addCategory(c, k, count, total) {
  const [c0, t0] = c[k] || [0, 0];
  if (c0 + count === 0 && t0 + total === 0) delete c[k]; else c[k] = [c0 + count, t0 + total];
}

// ─── hashing ─────────────────────────────────────────────────────────────────

/** JSON with sorted keys, so the same entry hashes the same on every phone. */
export const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
  : JSON.stringify(v);

export async function chain(prev, entry) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(prev + canonical(entry)));
  return toHex(new Uint8Array(digest).subarray(0, 8));
}

// ─── folding a log into its summary ──────────────────────────────────────────

const PAY_FIELDS = ["k", "a", "c", "v", "p", "pd"];
/** Copy only editable payment fields; protocol metadata is never editable. */
export const paymentChanges = (changes) => Object.fromEntries(
  PAY_FIELDS.filter(field => Object.hasOwn(changes, field)).map(field => [field, changes[field]])
);

/** Effective state of a writer's payments after its own edits and voids, by seq. */
export function effectivePays(log) {
  const pays = new Map();
  for (const e of log) {
    if (e.t === "pay") pays.set(e.s, { ...e });
    else if (e.t === "edit" && pays.has(e.r)) Object.assign(pays.get(e.r), paymentChanges(e.ch));
    else if (e.t === "void") pays.delete(e.r);
  }
  return pays;
}

/** The day a payment was made (may be earlier than the day it was logged). */
export const paymentDay = (p) => p.pd ?? p.d;

// Net effect and category totals of a whole log. No hashing, so it's cheap enough
// to redo on every write.
export function foldNets(member, log) {
  const n = {}, nl = {}, c = {};
  let f, tn;
  for (const e of log) {
    if (e.t === "back") addNets(n, { [e.fr]: e.v, [e.to]: -e.v });
    else if (e.t === "notme") addNets(e.lg ? nl : n, e.n);
    else if (e.t === "resolve" && e.n) addNets(e.lg ? nl : n, e.n, -1);   // the payer takes over the adjustment
    else if (e.t === "recat") for (const [, , v, from] of e.x) { addCategory(c, from, -1, -v); addCategory(c, e.k, 1, v); }
    else if (e.t === "fresh") f = [e.on, e.d, e.s];
    else if (e.t === "rename") tn = [e.nm, e.d, e.s];
  }
  for (const p of effectivePays(log).values()) {
    addNets(n, payEffect(member, p.v, p.p));
    addCategory(c, p.k, 1, p.v);
  }
  return { n, c, ...(Object.keys(nl).length ? { nl } : {}), ...(f ? { f } : {}), ...(tn ? { tn } : {}) };
}

/** Full summary of a complete log, including the hash chain. */
export async function foldLog(member, log) {
  log.forEach((e, i) => { if (e.s !== i + 1) throw new SchplitzError("invalid-payload", `Log has a gap before seq ${e.s}`); });
  let h = EMPTY_HASH;
  for (const e of log) h = await chain(h, e);
  return { s: log.length, h, ...foldNets(member, log) };
}

/** Current state of a payment, from the entries this phone has, or null. */
export const paymentState = (tally, writerId, sequence) => effectivePays(logOf(tally, writerId)).get(sequence) ?? null;
