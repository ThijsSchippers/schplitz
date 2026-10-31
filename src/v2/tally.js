// Schplitz v2 prototype — tally model (docs/v2.0.md §3).
//
// Each writer (one device acting for one member) owns an append-only log and a
// running summary of it. Balances are the sum of all summaries, so any link
// that carries every summary gives the exact balance, in any order.
import { CATEGORIES, isCategory } from "./categories.js";

export const MAX_MEMBERS   = 10;
export const ABOUT_EVEN    = 500;     // €5 in minor units of the tally currency
export const WINDOW_DAYS   = 30;
export const WINDOW_MIN    = 20;

export const randomId = (bytes) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, "0")).join("");

export const dayNumber = (date = new Date()) => Math.floor(date.getTime() / 86_400_000);

export const entryKey = (w, s) => `${w}:${s}`;

const emptySummary = () => ({ s: 0, h: "0".repeat(16), n: {}, c: {} });

// ─── creating and joining ────────────────────────────────────────────────────

export function createTally({ question, currency = "EUR", names, me, aboutEven = ABOUT_EVEN }) {
  if (!Array.isArray(names) || names.length < 2) throw new Error("A tally needs at least 2 members");
  if (names.length > MAX_MEMBERS) throw new Error(`A tally has at most ${MAX_MEMBERS} members`);
  if (new Set(names).size !== names.length) throw new Error("Member names must be unique when creating a tally");
  if (!names.includes(me)) throw new Error("'me' must be one of the names");
  const members = names.map(name => ({ id: randomId(4), name }));
  const member = members.find(m => m.name === me).id;
  const writer = randomId(4);
  return {
    id: randomId(16), question, currency, aboutEven, members,
    me: { member, writer },
    writers: { [writer]: { member, summary: emptySummary() } },
    entries: {},
  };
}

// A phone that receives a link for a tally it doesn't have: a new member joining,
// or a returning member whose phone lost its data. Either way it gets a new writer.
export function joinTally(header, payload, myMemberId) {
  const tally = {
    id: header.tallyId, question: header.question, currency: payload.cur, aboutEven: payload.ae,
    members: payload.m.map(([id, name]) => ({ id, name })),
    me: { member: myMemberId, writer: randomId(4) },
    writers: {}, entries: {},
  };
  if (!tally.members.some(m => m.id === myMemberId)) throw new Error("Unknown member");
  tally.writers[tally.me.writer] = { member: myMemberId, summary: emptySummary() };
  const report = mergePayload(tally, payload);
  const returning = Object.entries(tally.writers)
    .some(([w, x]) => w !== tally.me.writer && x.member === myMemberId && x.summary.s > 0);
  return { tally, returning, report };
}

// ─── money ───────────────────────────────────────────────────────────────────

// Equal split in integer minor units. Remainder cents go to participants in
// sorted-id order, so every phone computes exactly the same shares.
export function split(value, participants) {
  const ids = [...participants].sort();
  const base = Math.floor(value / ids.length);
  let rest = value - base * ids.length;
  const shares = {};
  for (const id of ids) { shares[id] = base + (rest > 0 ? 1 : 0); if (rest > 0) rest--; }
  return shares;
}

// Net effect of one payment: the payer is credited, every participant is charged their share.
export function payEffect(payer, value, participants) {
  const nets = {};
  if (!participants.length || value === 0) return nets;
  nets[payer] = (nets[payer] || 0) + value;
  for (const [id, share] of Object.entries(split(value, participants))) nets[id] = (nets[id] || 0) - share;
  return nets;
}

const addNets = (into, from, sign = 1) => {
  for (const [id, v] of Object.entries(from)) {
    into[id] = (into[id] || 0) + sign * v;
    if (into[id] === 0) delete into[id];
  }
  return into;
};

// ─── hashing ─────────────────────────────────────────────────────────────────

const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
  : JSON.stringify(v);

async function chain(prev, entry) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prev + canonical(entry)));
  return Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}

// ─── folding a writer's log into its summary ─────────────────────────────────

export const logOf = (tally, w) =>
  Object.values(tally.entries).filter(e => e.w === w).sort((a, b) => a.s - b.s);

// Effective state of a writer's payments after its own edits and voids.
export function effectivePays(log) {
  const pays = new Map();
  for (const e of log) {
    if (e.t === "pay") pays.set(e.s, { ...e });
    else if (e.t === "edit" && pays.has(e.r)) {
      const p = pays.get(e.r);
      for (const f of ["k", "a", "c", "v", "d", "p"]) if (f in e) p[f] = e[f];
    } else if (e.t === "void") pays.delete(e.r);
  }
  return pays;
}

// Net effect and category totals of a whole log (no hashing, so it's cheap).
function foldNets(member, log) {
  const sum = { n: {}, c: {} };
  for (const e of log) {
    if (e.t === "back")    addNets(sum.n, { [e.fr]: e.v, [e.to]: -e.v });
    if (e.t === "notme")   addNets(sum.n, e.n);
    if (e.t === "resolve" && e.n) addNets(sum.n, e.n, -1);   // the payer takes over the adjustment
  }
  for (const p of effectivePays(log).values()) {
    addNets(sum.n, payEffect(member, p.v, p.p));
    const [count, total] = sum.c[p.k] || [0, 0];
    sum.c[p.k] = [count + 1, total + p.v];
  }
  return sum;
}

export async function foldLog(member, log) {
  log.forEach((e, i) => { if (e.s !== i + 1) throw new Error(`Log has a gap before seq ${e.s}`); });
  let h = emptySummary().h;
  for (const e of log) h = await chain(h, e);
  return { s: log.length, h, ...foldNets(member, log) };
}

// After appending one entry: extend the hash chain by one step, refold the nets.
async function refreshOwnSummary(tally, entry) {
  const { writer, member } = tally.me;
  const prev = tally.writers[writer].summary;
  tally.writers[writer].summary = { s: entry.s, h: await chain(prev.h, entry), ...foldNets(member, logOf(tally, writer)) };
}

// ─── writing entries (always to my own log) ──────────────────────────────────

async function append(tally, fields, day) {
  const { writer } = tally.me;
  const s = tally.writers[writer].summary.s + 1;
  const entry = { w: writer, s, d: day ?? dayNumber(), ...fields };
  tally.entries[entryKey(writer, s)] = entry;
  await refreshOwnSummary(tally, entry);
  return entry;
}

const memberIds = (tally) => tally.members.map(m => m.id);

// amount/currency: what was paid; value: the tally-currency amount with the rate locked now.
export async function addPayment(tally, { category, amount, currency, value, participants, day }) {
  if (!isCategory(category)) throw new Error("Unknown category");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Amount must be a positive integer in minor units");
  const v = value ?? (currency === undefined || currency === tally.currency ? amount : null);
  if (!Number.isInteger(v) || v <= 0) throw new Error("Value in the tally currency is required for a foreign currency");
  const p = participants ?? memberIds(tally);
  if (!p.length || p.some(id => !memberIds(tally).includes(id))) throw new Error("Invalid participants");
  return append(tally, { t: "pay", k: category, a: amount, c: currency ?? tally.currency, v, p }, day);
}

function ownPay(tally, seq) {
  const pays = effectivePays(logOf(tally, tally.me.writer));
  if (!pays.has(seq)) throw new Error("You can only change your own payments");
  return pays.get(seq);
}

export async function editPayment(tally, seq, changes, day) {
  ownPay(tally, seq);
  const allowed = Object.fromEntries(Object.entries(changes).filter(([k]) => ["k", "a", "c", "v", "d", "p"].includes(k)));
  return append(tally, { t: "edit", r: seq, ...allowed }, day);
}

export async function voidPayment(tally, seq, day) {
  ownPay(tally, seq);
  return append(tally, { t: "void", r: seq }, day);
}

export async function addPaidBack(tally, { from, to, value, day }) {
  if (from === to || ![from, to].every(id => memberIds(tally).includes(id))) throw new Error("Invalid members");
  return append(tally, { t: "back", fr: from, to, v: value }, day);
}

// Current state of someone else's payment, from the entries this phone has.
export function paymentState(tally, w, s) {
  return effectivePays(logOf(tally, w)).get(s) || null;
}

// "I wasn't there": re-split without me, effective immediately (docs §3.5).
export async function notMe(tally, [w, s], day) {
  if (w === tally.me.writer) throw new Error("Use edit for your own payments");
  const pay = paymentState(tally, w, s);
  if (!pay) throw new Error("Payment not found on this phone");
  const me = tally.me.member;
  if (!pay.p.includes(me)) throw new Error("You're not part of this payment");
  if (openDisputes(tally).some(d => d.t === "notme" && d.w === tally.me.writer && entryKey(...d.r) === entryKey(w, s)))
    throw new Error("You're not part of this payment any more (waiting for the payer)");
  const payer = tally.writers[w].member;
  const delta = addNets(payEffect(payer, pay.v, pay.p.filter(id => id !== me)), payEffect(payer, pay.v, pay.p), -1);
  return append(tally, { t: "notme", r: [w, s], n: delta }, day);
}

export const QUERY_REASONS = ["amount", "date", "category", "duplicate"];

export async function askAbout(tally, [w, s], reason, day) {
  if (!QUERY_REASONS.includes(reason)) throw new Error("Unknown reason");
  if (!paymentState(tally, w, s)) throw new Error("Payment not found on this phone");
  return append(tally, { t: "query", r: [w, s], q: reason }, day);
}

function disputeOnMyPayment(tally, [w, s]) {
  const d = tally.entries[entryKey(w, s)];
  if (!d || !["notme", "query"].includes(d.t)) throw new Error("Dispute not found");
  if (d.r[0] !== tally.me.writer) throw new Error("Only the payer can resolve this");
  return d;
}

// Payer agrees: "Not me" → take that person out of the split. "Ask about it" → apply the fix.
export async function acceptDispute(tally, ref, fix = {}, day) {
  const d = disputeOnMyPayment(tally, ref);
  if (d.t === "notme") {
    const pay = ownPay(tally, d.r[1]);
    const out = tally.members.find(m => tally.writers[d.w].member === m.id).id;
    await editPayment(tally, d.r[1], { p: pay.p.filter(id => id !== out) }, day);
  } else if (fix.void) await voidPayment(tally, d.r[1], day);
  else if (Object.keys(fix).length) await editPayment(tally, d.r[1], fix, day);
  return append(tally, { t: "resolve", r: ref, o: "accepted", ...(d.t === "notme" ? { n: d.n } : {}) }, day);
}

// Payer disagrees: the payment stays as it was.
export async function keepAsIs(tally, ref, day) {
  const d = disputeOnMyPayment(tally, ref);
  return append(tally, { t: "resolve", r: ref, o: "kept", ...(d.t === "notme" ? { n: d.n } : {}) }, day);
}

export function openDisputes(tally) {
  const resolved = new Set(Object.values(tally.entries).filter(e => e.t === "resolve").map(e => entryKey(...e.r)));
  return Object.values(tally.entries).filter(e => ["notme", "query"].includes(e.t) && !resolved.has(entryKey(e.w, e.s)));
}

// ─── reading the tally ───────────────────────────────────────────────────────

export function balance(tally) {
  const nets = Object.fromEntries(tally.members.map(m => [m.id, 0]));
  for (const { summary } of Object.values(tally.writers)) addNets(nets, summary.n);
  for (const m of tally.members) nets[m.id] ??= 0;
  return nets;
}

// Whose turn among the people present: the one furthest behind.
export function whoseTurn(tally, present = memberIds(tally)) {
  const nets = balance(tally);
  const [member, net] = present.map(id => [id, nets[id]]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { member, net, aboutEven: Math.abs(net) < tally.aboutEven };
}

export function categoryTotals(tally) {
  const totals = {};
  for (const { summary } of Object.values(tally.writers))
    for (const [k, [count, sum]] of Object.entries(summary.c)) {
      const [c0, s0] = totals[k] || [0, 0];
      totals[k] = [c0 + count, s0 + sum];
    }
  return totals;
}

// Suggested amount on the logging screen. Prototype: lifetime average per category.
export function usualAmount(tally, category) {
  if (!CATEGORIES[category]?.prefill) return null;
  const t = categoryTotals(tally)[category];
  return t && t[0] ? Math.round(t[1] / t[0]) : null;
}

// "About 2 rounds of drinks": the most-used category that expresses the amount in 1–5 units.
export function socialUnits(tally, amount) {
  const options = Object.entries(categoryTotals(tally))
    .filter(([k, [count]]) => Number(k) !== 0 && count > 0)
    .map(([k, [count, sum]]) => ({ category: Number(k), count, units: Math.round(Math.abs(amount) / (sum / count)) }))
    .filter(o => o.units >= 1 && o.units <= 5)
    .sort((a, b) => b.count - a.count);
  return options[0] ? { category: options[0].category, units: options[0].units } : null;
}

// ─── combining what a link brings ────────────────────────────────────────────

export function mergePayload(tally, payload) {
  const report = { newEntries: [], conflicts: [] };
  for (const [id, name] of payload.m)
    if (!tally.members.some(m => m.id === id)) tally.members.push({ id, name });

  for (const [w, [member, s, h, n, c]] of Object.entries(payload.w)) {
    const incoming = { s, h, n, c };
    const known = tally.writers[w];
    if (!known) { tally.writers[w] = { member, summary: incoming }; continue; }
    if (w === tally.me.writer) {
      if (s > known.summary.s) report.conflicts.push({ writer: w, reason: "someone else wrote as this phone" });
      continue;
    }
    if (s > known.summary.s) known.summary = incoming;
    else if (s === known.summary.s && h !== known.summary.h) report.conflicts.push({ writer: w, reason: "two different histories" });
  }

  for (const e of payload.e) {
    const key = entryKey(e.w, e.s);
    if (tally.entries[key] || e.w === tally.me.writer) continue;
    tally.entries[key] = e;
    report.newEntries.push(e);
  }
  report.involvingMe = report.newEntries.filter(e => e.t === "pay" && e.w !== tally.me.writer &&
    paymentState(tally, e.w, e.s)?.p.includes(tally.me.member));
  return report;
}

// For every writer whose complete log is on this phone, recompute its summary
// and compare it with the one received. A mismatch means the copies diverged.
export async function verify(tally) {
  const problems = [];
  for (const [w, { member, summary }] of Object.entries(tally.writers)) {
    const log = logOf(tally, w);
    if (!log.length || log.length !== summary.s || log[log.length - 1].s !== summary.s) continue;
    const ours = await foldLog(member, log);
    if (ours.h !== summary.h || canonical(ours.n) !== canonical(summary.n)) problems.push(w);
  }
  return problems;
}
