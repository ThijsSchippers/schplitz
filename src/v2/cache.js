// Schplitz v2 — the phone's cache of its tallies (docs/v2.0.md §4).
//
// The chat is the database: the latest link always restores the balance and the last
// 30 days. This cache only saves the person from finding that link and typing the
// answer every time, and keeps history older than the window. Losing it costs
// convenience, never the tally.
//
// Several tabs can have the app open (a link from a chat often opens a new one). Every
// save is announced to the other tabs on a BroadcastChannel, so they reload the tally
// to refresh their views. Atomic revision checks prevent stale saves across tabs.
//
// IndexedDB stores:
//   tallies  tally objects (tally.js), plus `local`: phone-only state that never travels
//   keys     each tally's AES-GCM key as a non-extractable CryptoKey
//   meta     small app-wide values (e.g. which v1 data was converted)

import { SchplitzError } from "./schema.js";

export const DB_NAME = "schplitz-v2";
// Fence out older clients that could write without checking revisions.
const DB_VERSION = 2;

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
  const withLocalDefaults = (tally) => ({ ...tally, local: { ...emptyLocal(), ...tally.local } });
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("tallies")) db.createObjectStore("tallies", { keyPath: "id" });
    if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
    if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
  };
  const db = await new Promise((resolve, reject) => {
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new SchplitzError("cache-upgrade-blocked", "Close the other Schplitz tabs, then reload this page to update safely."));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      // An upgrade request cannot be cancelled after reporting a blocked tab.
      if (blocked) request.result.close(); else resolve(request.result);
    };
  });
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(`${name}-changes`) : null;
  let closed = false;
  const announce = (id) => { if (!closed) channel?.postMessage({ id }); };
  const close = () => { closed = true; channel?.close(); db.close(); };
  db.onversionchange = close;

  // Missing revisions on existing records mean the pre-revision cache format.
  // Presence of the field distinguishes a loaded old record from a new tally.
  const loaded = tally => tally ? {
    ...tally, local: { ...tally.local,
      cacheRevision: tally.local?.cacheRevision ?? null,
      cacheGeneration: tally.local?.cacheGeneration ?? null },
  } : null;

  function saveRecord(tally, key) {
    // Capture the revision and content together, before any asynchronous work.
    const snapshot = structuredClone(withLocalDefaults(tally));
    const existing = Object.hasOwn(snapshot.local, "cacheRevision");
    const revision = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(key === undefined ? ["tallies"] : ["tallies", "keys"], "readwrite");
      const store = tx.objectStore("tallies");
      let failure;
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("Transaction aborted"));
      tx.oncomplete = () => {
        // Only acknowledge the new revision after the whole transaction commits.
        tally.local = { ...tally.local, cacheRevision: revision, cacheGeneration: snapshot.local.cacheGeneration };
        announce(tally.id);
        resolve();
      };
      const read = store.get(snapshot.id);
      read.onsuccess = () => {
        const current = read.result;
        if (existing && !current) {
          failure = new SchplitzError("tally-removed", "This tally was removed from this phone. Open it again from a shared link.");
        } else if (Boolean(current) !== existing ||
            (current && (current.local?.cacheRevision ?? null) !== snapshot.local.cacheRevision)) {
          failure = new SchplitzError("stale-tally", "This tally changed in another tab. Reopen it and review your change before trying again.");
        }
        if (failure) { tx.abort(); return; }
        snapshot.local.cacheRevision = revision;
        snapshot.local.cacheGeneration = current ? current.local?.cacheGeneration ?? null : crypto.randomUUID();
        // No hashing, network calls or awaits inside this read/compare/write transaction.
        try {
          store.put(snapshot);
          if (key !== undefined) tx.objectStore("keys").put(key, snapshot.id);
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }

  return {
    /** All tallies, most recently seen first. */
    async listTallies() {
      const all = await transaction(db, "tallies", "readonly", tx => promisify(tx.objectStore("tallies").getAll()));
      return all.map(loaded).sort((a, b) => (b.local?.lastSeen ?? 0) - (a.local?.lastSeen ?? 0));
    },
    loadTally: (id) => transaction(db, "tallies", "readonly", tx => promisify(tx.objectStore("tallies").get(id))).then(loaded),
    saveTally: tally => saveRecord(tally),
    /** Revision check, tally and key update are one atomic transaction. */
    saveTallyWithKey: (tally, key) => saveRecord(tally, key),
    loadKey: (id) => transaction(db, "keys", "readonly", tx => promisify(tx.objectStore("keys").get(id))).then(k => k ?? null),
    /** Forgets a tally on this phone. The chat still has it. */
    forgetTally: (id) => transaction(db, ["tallies", "keys"], "readwrite", tx => Promise.all([
      promisify(tx.objectStore("tallies").delete(id)),
      promisify(tx.objectStore("keys").delete(id)),
    ])).then(() => announce(id)),
    getMeta: (key) => transaction(db, "meta", "readonly", tx => promisify(tx.objectStore("meta").get(key))).then(v => v ?? null),
    setMeta: (key, value) => transaction(db, "meta", "readwrite", tx => promisify(tx.objectStore("meta").put(value, key))),
    /** Calls `listener(tallyId)` when another tab saves or forgets a tally. Returns an unsubscribe function. */
    onOtherTabChange(listener) {
      if (!channel) return () => {};
      const handler = (e) => listener(e.data?.id);
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
    close,
  };
}

/**
 * Asks the browser to keep this site's data under storage pressure. It doesn't stop
 * Safari's 7-day rule (docs §4.1), but it's free. Returns whether it was granted.
 */
export async function requestPersistence() {
  try { return Boolean(await navigator.storage?.persist?.()); } catch { return false; }
}
