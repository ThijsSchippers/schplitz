export const CURRENCIES = {
  EUR:{ symbol:"€",  name:"Euro" },
  USD:{ symbol:"$",  name:"US Dollar" },
  ALL:{ symbol:"L",  name:"Albanian Lek" },
  AED:{ symbol:"د.إ",name:"UAE Dirham" },
  NOK:{ symbol:"kr", name:"Norwegian Krone" },
  SEK:{ symbol:"kr", name:"Swedish Krona" },
  THB:{ symbol:"฿",  name:"Thai Baht" },
};

export const FALLBACK_RATES = { EUR:1, USD:1.04, ALL:113.5, AED:3.82, NOK:11.80, SEK:11.45, THB:38.0 };

export const TOAST_DURATION     = 2400;
export const PBKDF2_ITERS       = 200_000;
export const MAX_NAME_LEN       = 50;
export const MAX_QUESTION_LEN   = 200;
export const MAX_DESCRIPTION_LEN = 30;

export const STATUS_OPTIONS = [
  { value: "just_started", label: "Just getting started" },
  { value: "almost_done",  label: "Almost done adding expenses" },
  { value: "done",         label: "Done adding expenses" },
];

const NAME_PAIRS = [
  ["Alex", "Jordan"], ["Sofia", "Liam"], ["Amara", "Noah"],  ["Yuki", "Carlos"],
  ["Fatima", "Erik"], ["Priya", "Mateo"], ["Leila", "Sam"], ["Chen", "Ingrid"],
];
const _pair = NAME_PAIRS[Math.floor(Math.random() * NAME_PAIRS.length)];
export const PLACEHOLDER_ME    = _pair[0];
export const PLACEHOLDER_OTHER = _pair[1];

export const normalizeAnswer = (s) => s.toLowerCase().replace(/\s+/g, "");

export const fmt = (n, c) => {
  const s = (CURRENCIES[c] || CURRENCIES.EUR).symbol;
  const v = parseFloat(n);
  return isNaN(v) ? `${s}0.00` : `${s}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const uid = () => {
  const ts = Date.now().toString(36);
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const rand = Array.from(bytes).map(b => b.toString(36).padStart(2, "0")).join("");
  return `${ts}-${rand}`;
};

export const today = () => new Date().toISOString().split("T")[0];

export function validateExpense(e) {
  if (!e || typeof e !== "object") throw new Error("Expense must be an object");
  if (!e.id || typeof e.id !== "string") throw new Error("Invalid or missing expense ID");
  if (!e.description || typeof e.description !== "string" || !e.description.trim()) throw new Error("Invalid or missing description");
  if (e.description.trim().length > MAX_DESCRIPTION_LEN) throw new Error(`Description exceeds ${MAX_DESCRIPTION_LEN} characters`);
  if (typeof e.amount !== "number" || isNaN(e.amount) || e.amount < 0) throw new Error("Invalid expense amount");
  if (!e.currency || !CURRENCIES[e.currency]) throw new Error(`Unknown currency: ${e.currency}`);
  if (!e.paidBy || typeof e.paidBy !== "string" || !e.paidBy.trim()) throw new Error("Invalid or missing paidBy");
  if (!e.date || typeof e.date !== "string") throw new Error("Invalid or missing date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error("Invalid date format");
  return true;
}

export async function compressToUrl(str) {
  const stream = new Blob([str]).stream();
  const compressed = stream.pipeThrough(new CompressionStream("deflate-raw"));
  const buf = await new Response(compressed).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function decompressFromUrl(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream();
  const decompressed = stream.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(decompressed).text();
}

// Not exported — only used by encrypt/decrypt below
async function deriveKey(pass, salt) {
  const b = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" }, b, 256);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(pt, pass) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(pass, salt);
    const buf  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pt));
    const out  = new Uint8Array(salt.length + iv.length + buf.byteLength);
    out.set(salt, 0); out.set(iv, salt.length); out.set(new Uint8Array(buf), salt.length + iv.length);
    return btoa(String.fromCharCode(...out));
  } catch (err) { console.error("Encryption failed"); throw err; }
}

export async function decrypt(b64, pass) {
  try {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const key = await deriveKey(pass, raw.slice(0, 16));
    return new TextDecoder().decode(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(16, 28) }, key, raw.slice(28))
    );
  } catch (err) { console.error("Decryption failed"); throw err; }
}

// Cache: "YYYY-MM-DD:CUR" -> rate
const rateCache = {};

export async function fetchHistoricalRate(date, currency) {
  if (currency === "EUR") return 1;
  const key = `${date}:${currency}`;
  if (rateCache[key] !== undefined) return rateCache[key];
  try {
    const r = await fetch(`https://api.frankfurter.app/${date}?from=EUR&to=${currency}`);
    if (!r.ok) throw new Error("API error");
    const d = await r.json();
    const rate = d.rates?.[currency];
    if (rate == null) throw new Error("No rate returned");
    rateCache[key] = rate;
    return rate;
  } catch {
    console.warn(`Failed to fetch rate for ${currency} on ${date}, using fallback`);
    const fallback = FALLBACK_RATES[currency] ?? 1;
    rateCache[key] = fallback;
    return fallback;
  }
}

export async function toEURHistorical(amt, cur, date) {
  if (cur === "EUR") return amt;
  const rate = await fetchHistoricalRate(date, cur);
  return amt / rate;
}
