// The logging screen's numpad (docs/v2.0.md §6.2.2), as pure functions.
//
// The typed amount is kept as a string with "." as decimal point, e.g. "12.5", and
// converted to integer minor units only when the payment is added.

import { toMinorUnits } from "../encoding.js";

export const MAX_WHOLE_DIGITS = 7;

/**
 * State after a key press. state: { text, suggested }.
 *   suggested  the text is the tally's usual amount, shown greyed out: the first digit
 *              replaces it, backspace clears it.
 * key: "0"–"9", ".", "back" or "clear". decimals: the currency's minor-unit digits.
 */
export function pressKey(state, key, decimals) {
  const text = state.suggested ? "" : state.text;
  if (key === "clear" || (key === "back" && state.suggested)) return { text: "", suggested: false };
  if (key === "back") return { text: text.slice(0, -1), suggested: false };
  if (key === ".") {
    if (decimals === 0 || text.includes(".")) return state;
    return { text: (text || "0") + ".", suggested: false };
  }
  if (!/^\d$/.test(key)) return state;
  const [whole, frac] = text.split(".");
  if (frac !== undefined) return frac.length >= decimals ? state : { text: text + key, suggested: false };
  if (whole === "0") return { text: key, suggested: false };
  if (whole.length >= MAX_WHOLE_DIGITS) return state;
  return { text: text + key, suggested: false };
}

/** Typed text for a currency switch: drops decimals the new currency doesn't have. */
export function fitDecimals(text, decimals) {
  const [whole, frac] = text.split(".");
  if (frac === undefined) return text;
  return decimals === 0 ? whole : `${whole}.${frac.slice(0, decimals)}`;
}

/** Minor units → typed text, e.g. 740 → "7.40". */
export const textOfMinor = (minor, decimals) => (decimals ? (minor / 10 ** decimals).toFixed(decimals) : String(minor));

/** Minor units → text as someone would type it, e.g. 2400 → "24", 740 → "7.4" (for editing). */
export function typedOfMinor(minor, decimals) {
  const text = textOfMinor(minor, decimals);
  return decimals ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/** Typed text → minor units, e.g. "7.4" → 740. */
export const minorOfText = (text, decimals) => (text && text !== "." ? toMinorUnits(Number(text), decimals) : 0);

/** The decimal separator of the phone's language, for the numpad key. */
export const decimalSeparator = (loc) => new Intl.NumberFormat(loc).formatToParts(1.5).find(p => p.type === "decimal")?.value ?? ".";

/**
 * Typed text as shown in the amount display, keeping what was typed: "12." shows the
 * separator, "12.5" one decimal. "1240" in THB → "฿1,240".
 */
export function displayTyped(text, currency, loc) {
  const [whole, frac] = (text || "0").split(".");
  const parts = new Intl.NumberFormat(loc, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .formatToParts(Number(whole || 0));
  const lastInteger = parts.map(p => p.type).lastIndexOf("integer");
  return parts.map((p, i) => i === lastInteger && frac !== undefined ? p.value + decimalSeparator(loc) + frac : p.value).join("");
}

/** Hardware keyboard key → numpad key, or null. */
export function keyFromKeyboard(key) {
  if (/^\d$/.test(key)) return key;
  if (key === "," || key === ".") return ".";
  if (key === "Backspace") return "back";
  if (key === "Delete") return "clear";
  return null;
}
