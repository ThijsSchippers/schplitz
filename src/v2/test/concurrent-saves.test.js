// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { decodeLink } from "../link.js";
import { openCache } from "../cache.js";
import { createTally, allEntries, verify, voidPayment, addMember } from "../tally.js";
import { save, recordPayment, updatePayment, changeTally, prepareShare, markShared, unsharedCount } from "../app.js";

const connections = [];
afterEach(() => { connections.splice(0).forEach(cache => cache.close()); });
async function setup() {
  const name = `concurrent-${crypto.randomUUID()}`;
  const first = await openCache(name), second = await openCache(name);
  connections.push(first, second);
  const tally = createTally({ question: "Where?", names: ["A", "B"], me: "A" });
  await save(first, tally);
  return { first, second, tally, name };
}
const fields = { category: 2, amount: 1200, currency: "EUR", paidOn: 20400 };

it("rejects stale whole-tally saves without overwriting a committed payment", async () => {
  const { first, second, tally } = await setup();
  const stale = await second.loadTally(tally.id);
  await recordPayment(first, tally, fields);
  await expect(second.saveTally(stale)).rejects.toMatchObject({ code: "stale-tally" });
  expect(allEntries(await first.loadTally(tally.id))).toHaveLength(1);
});

it("retains both simultaneous payments with distinct sequences and a valid hash chain", async () => {
  const { first, second, tally } = await setup();
  const a = await first.loadTally(tally.id), b = await second.loadTally(tally.id);
  const results = await Promise.all([
    recordPayment(first, a, fields),
    recordPayment(second, b, { ...fields, amount: 3400 }),
  ]);
  const saved = await first.loadTally(tally.id);
  expect(allEntries(saved).map(e => e.a).sort((x, y) => x - y)).toEqual([1200, 3400]);
  expect(results.map(e => e.s).sort()).toEqual([1, 2]);
  expect(await verify(saved)).toEqual([]);
});

it("rejects a stale edit and does not publish the uncommitted edit in memory", async () => {
  const { first, second, tally } = await setup();
  const payment = await recordPayment(first, tally, fields);
  const stale = await second.loadTally(tally.id), before = structuredClone(stale);
  await updatePayment(first, tally, payment, { ...fields, participants: payment.p, amount: 2500 });
  await expect(updatePayment(second, stale, payment, { ...fields, participants: payment.p, amount: 4000 }))
    .rejects.toMatchObject({ code: "stale-tally" });
  expect(stale).toEqual(before);
  expect(allEntries(await first.loadTally(tally.id)).at(-1).ch.a).toBe(2500);
});

it("rejects edits based on an outdated form even after the tally was refreshed", async () => {
  const { first, second, tally } = await setup();
  const payment = await recordPayment(first, tally, fields);
  await changeTally(first, tally, draft => voidPayment(draft, payment.s));
  const refreshed = await second.loadTally(tally.id);
  await expect(updatePayment(second, refreshed, payment, { ...fields, participants: payment.p, amount: 4000 }))
    .rejects.toMatchObject({ code: "stale-tally" });
});

it("does not resurrect a tally removed while a payment was pending", async () => {
  const { first, second, tally } = await setup();
  await second.forgetTally(tally.id);
  await expect(recordPayment(first, tally, fields)).rejects.toMatchObject({ code: "tally-removed" });
  expect(await first.loadTally(tally.id)).toBeNull();
  expect(allEntries(tally)).toEqual([]);
});

it("does not retry a pending payment against a replacement tally with the same ID", async () => {
  const { first, second, tally } = await setup();
  await second.forgetTally(tally.id);
  const replacement = createTally({ question: "Where?", names: ["A", "B"], me: "A" });
  replacement.id = tally.id;
  await save(second, replacement);
  await expect(recordPayment(first, tally, fields)).rejects.toMatchObject({ code: "tally-removed" });
  expect(allEntries(await first.loadTally(tally.id))).toEqual([]);
});

it("does not retry storage failures or retain an unsaved mutation", async () => {
  const { first, tally } = await setup();
  const before = structuredClone(tally);
  const failed = vi.spyOn(first, "saveTally").mockRejectedValue(new Error("quota"));
  await expect(recordPayment(first, tally, fields)).rejects.toThrow("quota");
  expect(failed).toHaveBeenCalledOnce();
  expect(tally).toEqual(before);
});


it("serializes rapid additions on one object and shares only committed entries", async () => {
  const { first, tally } = await setup();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const writes = [recordPayment(first, tally, fields), recordPayment(first, tally, { ...fields, amount: 3400 })];
  const shared = prepareShare(tally, key);
  await Promise.all(writes);
  const link = await shared;
  const { payload } = await decodeLink(link.url, key);
  expect(payload.e.filter(entry => entry.t === "pay")).toHaveLength(2);
  expect(link.sharedSeq).toBe(2);
  expect(JSON.stringify(payload)).not.toMatch(/cacheRevision|cacheGeneration/);
  expect(await verify(await first.loadTally(tally.id))).toEqual([]);
});

it("preserves the original participants and exchange rate across a retry", async () => {
  const { first, second, tally } = await setup();
  const stale = await second.loadTally(tally.id);
  const participants = tally.members.map(member => member.id);
  await changeTally(first, tally, draft => addMember(draft, "C"));
  const rateFor = vi.fn(async (_day, currency) => ({ rate: currency === "USD" ? 2 : 1, estimated: false }));
  const entry = await recordPayment(second, stale, { ...fields, currency: "USD", rateFor });
  expect(entry.v).toBe(600);
  expect(entry.p).toEqual(participants);
  expect(rateFor).toHaveBeenCalledTimes(2); // USD and EUR, once each, not once per attempt.
  expect(stale.members).toHaveLength(3);
});

it("bounds retries under sustained contention and leaves the original tally intact", async () => {
  const { first, tally } = await setup();
  const before = structuredClone(tally);
  const failed = vi.spyOn(first, "saveTally").mockRejectedValue(Object.assign(new Error("changed"), { code: "stale-tally" }));
  await expect(recordPayment(first, tally, fields)).rejects.toMatchObject({ code: "stale-tally" });
  expect(failed).toHaveBeenCalledTimes(5);
  expect(tally).toEqual(before);
});

it("guards key writes with the same revision and aborts the tally if the key cannot be stored", async () => {
  const { first, second, tally } = await setup();
  await first.saveTallyWithKey(tally, "original-key");
  const stale = await second.loadTally(tally.id);
  await recordPayment(first, tally, fields);
  await expect(second.saveTallyWithKey(stale, "replacement-key")).rejects.toMatchObject({ code: "stale-tally" });
  expect(await first.loadKey(tally.id)).toBe("original-key");
  const before = await first.loadTally(tally.id);
  const draft = structuredClone(before);
  draft.question = "Changed";
  await expect(first.saveTallyWithKey(draft, () => {})).rejects.toMatchObject({ name: "DataCloneError" });
  expect(await first.loadTally(tally.id)).toEqual(before);
  expect(draft.local.cacheRevision).toBe(before.local.cacheRevision);
});

it("does not mark a concurrent new payment as shared when an older link is copied", async () => {
  const { first, second, tally } = await setup();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await recordPayment(first, tally, fields);
  const link = await prepareShare(tally, key);
  const other = await second.loadTally(tally.id);
  await recordPayment(second, other, { ...fields, amount: 3400 });
  await markShared(first, tally, link);
  expect(unsharedCount(tally)).toBe(1);
  expect(tally.local.sharedSeq).toBe(1);
  expect(allEntries(await first.loadTally(tally.id))).toHaveLength(2);
});

it("protects existing records without revision metadata on their first updated save", async () => {
  const { first, second, tally, name } = await setup();
  // Reproduce the on-disk format from before this change, without a DB upgrade.
  const legacy = structuredClone(tally);
  delete legacy.local.cacheRevision;
  delete legacy.local.cacheGeneration;
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("tallies", "readwrite");
      tx.objectStore("tallies").put(legacy);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
  const [a] = await first.listTallies();
  const b = await second.loadTally(tally.id);
  expect(a.local.cacheRevision).toBeNull();
  await Promise.all([recordPayment(first, a, fields), recordPayment(second, b, { ...fields, amount: 3400 })]);
  expect(allEntries(await first.loadTally(tally.id))).toHaveLength(2);
});


it("requires old tabs to close before upgrading, then prevents old clients from reopening", async () => {
  const name = `upgrade-${crypto.randomUUID()}`;
  const old = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("tallies", { keyPath: "id" });
      request.result.createObjectStore("keys");
      request.result.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await expect(openCache(name)).rejects.toMatchObject({ code: "cache-upgrade-blocked" });
  } finally { old.close(); }
  const upgraded = await openCache(name);
  connections.push(upgraded);
  await expect(new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  })).rejects.toMatchObject({ name: "VersionError" });
});

it("acknowledges a committed save even if the connection closes before completion", async () => {
  const { first, second, tally } = await setup();
  const draft = structuredClone(tally);
  draft.question = "Updated?";
  const saving = first.saveTally(draft);
  first.close();
  await saving;
  expect((await second.loadTally(tally.id)).question).toBe("Updated?");
});
