// Schplitz v2 — the phone's cache of its tallies (docs/v2.0.md §4).
//
// The chat is the database: the latest link always restores the balance and the last
// 30 days. This cache only saves the person from finding that link and typing the
// answer every time, and keeps history older than the window. Losing it costs
// convenience, never the tally.
//
// IndexedDB stores:
//   tallies  tally objects (tally.js), plus `local`: phone-only state that never travels
//   keys     each tally's AES-GCM key as a non-extractable CryptoKey
//   meta     small app-wide values (e.g. which v1 data was converted)

export const DB_NAME = "schplitz-v2";
const DB_VERSION = 1;

const promisify = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function transaction(db, stores, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    Promise.resolve(work(tx)).then(r => { result = r; }, reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

/** Phone-only state kept with each tally. */
export const emptyLocal = () => ({
  sharedSeq: 0,        // my writer's seq when I last shared a link
  handshakeSent: false, // converted v1 tallies: the first full link has been shared
  lastSeen: 0,         // ms timestamp, for ordering the home list
});

/**
 * Opens the cache. Returns an object with async methods; all values are structured
 * clones, so callers own what they get back.
 */
export async function openCache(name = DB_NAME) {
  const request = indexedDB.open(name, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("tallies")) db.createObjectStore("tallies", { keyPath: "id" });
    if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
    if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
  };
  const db = await promisify(request);

  return {
    /** All tallies, most recently seen first. */
    async listTallies() {
      const all = await transaction(db, "tallies", "readonly", tx => promisify(tx.objectStore("tallies").getAll()));
      return all.sort((a, b) => (b.local?.lastSeen ?? 0) - (a.local?.lastSeen ?? 0));
    },
    loadTally: (id) => transaction(db, "tallies", "readonly", tx => promisify(tx.objectStore("tallies").get(id))).then(t => t ?? null),
    saveTally: (tally) => transaction(db, "tallies", "readwrite", tx => promisify(tx.objectStore("tallies").put({ ...tally, local: { ...emptyLocal(), ...tally.local } }))),
    /** Saves a tally and its key together, so one is never cached without the other. */
    saveTallyWithKey: (tally, key) => transaction(db, ["tallies", "keys"], "readwrite", tx => Promise.all([
      promisify(tx.objectStore("tallies").put({ ...tally, local: { ...emptyLocal(), ...tally.local } })),
      promisify(tx.objectStore("keys").put(key, tally.id)),
    ])),
    loadKey: (id) => transaction(db, "keys", "readonly", tx => promisify(tx.objectStore("keys").get(id))).then(k => k ?? null),
    /** Forgets a tally on this phone. The chat still has it. */
    forgetTally: (id) => transaction(db, ["tallies", "keys"], "readwrite", tx => Promise.all([
      promisify(tx.objectStore("tallies").delete(id)),
      promisify(tx.objectStore("keys").delete(id)),
    ])),
    getMeta: (key) => transaction(db, "meta", "readonly", tx => promisify(tx.objectStore("meta").get(key))).then(v => v ?? null),
    setMeta: (key, value) => transaction(db, "meta", "readwrite", tx => promisify(tx.objectStore("meta").put(value, key))),
    close: () => db.close(),
  };
}

/**
 * Asks the browser to keep this site's data under storage pressure. It doesn't stop
 * Safari's 7-day rule (docs §4.1), but it's free. Returns whether it was granted.
 */
export async function requestPersistence() {
  try { return Boolean(await navigator.storage?.persist?.()); } catch { return false; }
}
