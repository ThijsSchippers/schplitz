// Text the screens show: money, days, whose turn, share messages and error messages.
// Pure functions, so they're tested without a browser.

import { CATEGORIES, OTHER } from "../categories.js";
import { whoseTurn, socialUnits, effectivePays, logOf, allEntries, balance, tallyName } from "../tally.js";
import { decimalsOf } from "../encoding.js";

export const locale = () => (typeof navigator !== "undefined" && navigator.language) || "en";

/** Minor units → "€7.40" / "€ 7,40" in the phone's language. */
export function money(minor, currency, loc = locale()) {
  const d = decimalsOf(currency);
  return new Intl.NumberFormat(loc, { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d);
}

/** "Today", "Yesterday", "Friday" (this week), else "14 Mar" (and the year if it's not this year). */
export function dayLabel(day, today, loc = locale()) {
  const diff = today - day;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const date = new Date(day * 86_400_000);
  if (diff > 1 && diff < 7) return new Intl.DateTimeFormat(loc, { weekday: "long", timeZone: "UTC" }).format(date);
  const sameYear = date.getUTCFullYear() === new Date(today * 86_400_000).getUTCFullYear();
  return new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(date);
}

export const nameOf = (tally, memberId) => tally.members.find(m => m.id === memberId)?.name ?? "Someone";

/** Everyone except me, as "Liam" or "Liam and Noor" or "Liam, Noor and Daan". */
export function othersLabel(tally, loc = locale()) {
  const names = tally.members.filter(m => m.id !== tally.me.member).map(m => m.name);
  return new Intl.ListFormat(loc, { style: "long", type: "conjunction" }).format(names);
}

/** The tally's title: its name if it has one, else the other people ("Liam and Noor"). */
export const tallyTitle = (tally, loc = locale()) => tallyName(tally) ?? othersLabel(tally, loc);

/** "about 2 coffees", or null when no category fits (docs §7). */
export function socialAmount(tally, amount) {
  const u = socialUnits(tally, amount);
  if (!u) return null;
  const c = CATEGORIES[u.category];
  return u.units === 1 ? `about ${c.one}` : `about ${u.units} ${c.many}`;
}

/** "about 2 coffees", or "a bit"/"well" when no category fits. */
const sizeOf = (tally, net) => socialAmount(tally, net) ?? (Math.abs(net) < 4 * tally.aboutEven ? "a bit" : "well");

/** The big line on the tally screen. `present`: member IDs here today (default everyone). */
export function hero(tally, present) {
  const turn = whoseTurn(tally, present);
  if (turn.aboutEven) return { title: "You're about even", sub: "Nobody's really behind right now.", member: null };
  const isMe = turn.member === tally.me.member;
  const name = nameOf(tally, turn.member);
  const title = isMe ? "Next one's on you" : `Next one's on ${name}`;
  // Not behind overall, only compared with the people here today.
  if (turn.net > -tally.aboutEven)
    return { title, sub: isMe ? "Of the people here, you're furthest behind." : `Of the people here, ${name} is furthest behind.`, member: turn.member };
  const size = sizeOf(tally, turn.net);
  return { title, sub: isMe ? `You're ${size} behind.` : `${name} is ${size} behind.`, member: turn.member };
}

/** Everyone's position for a group, furthest behind first: [{ id, name, isMe, text }]. */
export function standings(tally) {
  const nets = balance(tally);
  return tally.members
    .map(m => ({ id: m.id, name: m.name, isMe: m.id === tally.me.member, net: nets[m.id] }))
    .sort((a, b) => a.net - b.net || (a.name < b.name ? -1 : 1))
    .map(x => ({ ...x, text: Math.abs(x.net) < tally.aboutEven ? "about even" : `${sizeOf(tally, x.net)} ${x.net < 0 ? "behind" : "ahead"}` }));
}

const GOT = {
  0: "Added a payment", 1: "Got the stay", 2: "Got the meal", 3: "Got the groceries", 4: "Got the ride", 5: "Got the fuel",
  6: "Got the drinks", 7: "Got the coffees", 8: "Got the court", 9: "Got the gift", 10: "Got the tickets",
};
const ADD = {
  0: "Add payment", 1: "Add stay", 2: "Add meal", 3: "Add groceries", 4: "Add ride", 5: "Add fuel",
  6: "Add drinks", 7: "Add coffee", 8: "Add court", 9: "Add gift", 10: "Add tickets",
};
export const addLabel = (category) => ADD[category] ?? "Add";

/** The message that goes with a shared link. No amounts and no emoji (docs §6.3). */
export function shareMessage(tally, lastCategory) {
  const turn = whoseTurn(tally);
  const pair = tally.members.length === 2;
  const next = turn.aboutEven ? "We're about even."
    : turn.member === tally.me.member ? "Still my turn next."
    : pair ? "Next one's on you." : `Next one's on ${nameOf(tally, turn.member)}.`;
  const head = lastCategory === undefined ? "Here's our Schplitz tally." : `${GOT[lastCategory] ?? GOT[OTHER]}.`;
  return `${head} ${next}`;
}

export const INVITE_MESSAGE = "I started a Schplitz tally for us. Open the link and type the answer to join.";

/** "Liam asks about the amount" */
export const QUERY_LABELS = { amount: "the amount", date: "the date", category: "the category", duplicate: "a possible duplicate" };
/** The reason chips: "What's off? amount / date / category / duplicate" */
export const QUERY_CHIPS = { amount: "Amount", date: "Date", category: "Category", duplicate: "Duplicate" };

/**
 * Every payment this phone knows, newest first, with what the screens need.
 * provisional: someone else's v1 history as this phone last saw it.
 */
export function payments(tally) {
  // Categories after sorting old entries: the latest `recat` per entry wins (as categoryOf).
  const sorted = new Map();
  allEntries(tally).filter(e => e.t === "recat")
    .sort((a, b) => a.d - b.d || (a.w < b.w ? -1 : a.w > b.w ? 1 : a.s - b.s))
    .forEach(r => r.x.forEach(([w, s]) => sorted.set(`${w}:${s}`, r.k)));
  const out = [];
  for (const [w, writer] of Object.entries(tally.writers))
    for (const p of effectivePays(logOf(tally, w)).values())
      out.push({ ...p, k: sorted.get(`${w}:${p.s}`) ?? p.k, payer: writer.member, mine: w === tally.me.writer,
        legacy: Boolean(writer.legacy), provisional: Boolean(writer.provisional), day: p.pd ?? p.d });
  return out.sort((a, b) => b.day - a.day || b.d - a.d || (a.w < b.w ? 1 : -1));
}

/** User-facing text for an error from the v2 modules. */
export function errorText(err) {
  switch (err?.code) {
    case "cannot-decrypt": return "That answer doesn't match this tally. Check with whoever sent the link.";
    case "not-a-link": return "This isn't a Schplitz link, or part of it is missing.";
    case "unsupported-version": return "This link is from a newer version of Schplitz. Reload the page to update.";
    case "invalid-payload": return "This link is damaged and can't be opened.";
    // These messages are written for people where they're raised.
    case "answer-mismatch": case "too-large": case "invalid-input": case "not-allowed": case "not-found": return err.message;
    default: return "Something went wrong. Try again.";
  }
}
