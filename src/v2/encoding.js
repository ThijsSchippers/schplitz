// Schplitz v2 prototype — small byte, text and number helpers shared by the modules.

/** Bytes → lowercase hex. */
export const toHex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

/** Lowercase hex → bytes. The caller validates the input. */
export const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16));

/** `bytes` random bytes as hex: 4 bytes for member and writer IDs, 16 for tally IDs. */
export const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

// String.fromCharCode(...bytes) overflows the call stack on large inputs (full-copy
// files), so convert in chunks.
const CHUNK = 0x8000;

/** Bytes → URL-safe base64 without padding. */
export function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe base64 → bytes. Throws on invalid input. */
export const fromBase64Url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

export const utf8 = (s) => new TextEncoder().encode(s);

/** Raw deflate. */
export async function deflate(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
}

/**
 * Raw inflate that stops once the output exceeds `maxBytes`, so a small link
 * can't expand into something that exhausts memory.
 */
export async function inflate(bytes, maxBytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new RangeError(`Decompressed data exceeds ${maxBytes} bytes`); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/** Number of minor-unit decimals for a currency (EUR 2, JPY 0, ALL 0). */
export const decimalsOf = (currency) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;

/**
 * Decimal amount → integer minor units, rounding half away from zero on the decimal
 * value as written. `Math.round(1.005 * 100)` gives 100 because of binary floating
 * point; shifting the exponent in the string representation gives 101.
 */
export function toMinorUnits(amount, decimals) {
  const written = String(Math.abs(amount));
  // Very small or large numbers are already written in exponent form ("1e-7").
  const shifted = written.includes("e") ? Math.abs(amount) * 10 ** decimals : Number(`${written}e${decimals}`);
  return Math.sign(amount) * Math.round(shifted) || 0;
}

/** Calendar day number (days since 1970-01-01) of a date in the phone's own time zone. */
export const localDayNumber = (date = new Date()) =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

/** Day number of a `YYYY-MM-DD` calendar date. */
export const dayOfIsoDate = (iso) =>
  Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);

/** `YYYY-MM-DD` of a day number (inverse of dayOfIsoDate). */
export const isoOfDay = (day) => new Date(day * 86_400_000).toISOString().slice(0, 10);
