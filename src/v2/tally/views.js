// Read-only views of a tally: balances, categories, and whose turn it is.
import { CATEGORIES } from "../categories.js";
import { SchplitzError } from "../schema.js";
import { allEntries, paymentState, addNets, addCategory } from "./log.js";

/** Current category of a payment, after any sorting of old entries. */
export function categoryOf(tally, w, s) {
  let k = paymentState(tally, w, s)?.k;
  const recats = allEntries(tally).filter(e => e.t === "recat" && e.x.some(([xw, xs]) => xw === w && xs === s))
    .sort((a, b) => a.d - b.d || (a.w < b.w ? -1 : a.w > b.w ? 1 : a.s - b.s));
  for (const r of recats) k = r.k;
  return k;
}

// A tally-wide choice anyone can make ("start fresh", the tally's name): each writer's
// summary carries its latest [value, day, seq]; across writers the latest wins, by day,
// then writer ID, then seq, so every phone agrees.
function latestChoice(tally, field) {
  let latest = null;
  for (const [w, { summary }] of Object.entries(tally.writers)) {
    if (!summary[field]) continue;
    const [value, d, s] = summary[field];
    if (!latest || d > latest.d || (d === latest.d && (w > latest.w || (w === latest.w && s > latest.s)))) latest = { value, d, w, s };
  }
  return latest;
}

/** Whether "start fresh" is on. */
export const freshStart = (tally) => Boolean(latestChoice(tally, "f")?.value);

/** The tally's name ("Padel crew"), or null when nobody named it. */
export const tallyName = (tally) => latestChoice(tally, "tn")?.value || null;

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

/**
 * Whose turn it is among the people present: the one furthest behind.
 * aboutEven: everyone present is within `aboutEven` (€5) of the middle, i.e. the gap
 * between the furthest ahead and the furthest behind is under twice that. For a pair
 * this is exactly "less than €5 behind"; for a group it compares the people present
 * with each other, not with the whole group.
 */
export function whoseTurn(tally, present = tally.members.map(m => m.id)) {
  const members = new Set(tally.members.map(member => member.id));
  if (!present.length || present.some(id => !members.has(id))) throw new SchplitzError("invalid-input", "Present must be members of the tally");
  const nets = balance(tally);
  const ranked = present.map(id => [id, nets[id]]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const [member, net] = ranked[0];
  const spread = ranked.at(-1)[1] - net;
  return { member, net, aboutEven: spread < 2 * tally.aboutEven };
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

/**
 * "About 2 rounds of drinks": the most-used category that expresses the amount in 1–5 units.
 * Categories without a unit name (Something else, Stays, Transport, Tickets) are never used.
 */
export function socialUnits(tally, amount) {
  const best = Object.entries(categoryTotals(tally))
    .filter(([k, [count, sum]]) => CATEGORIES[k]?.one && count > 0 && sum > 0)
    .map(([k, [count, sum]]) => ({ category: Number(k), count, units: Math.round(Math.abs(amount) / (sum / count)) }))
    .filter(o => o.units >= 1 && o.units <= 5)
    .sort((a, b) => b.count - a.count || a.category - b.category)[0];
  return best ? { category: best.category, units: best.units } : null;
}
