// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openCache } from "../cache.js";
import { recordPayment, updatePayment, changeTally } from "../app.js";
import { createTally, paymentState, askAbout, mergePayload, openDisputes } from "../tally.js";
import { encodeLink, decodeLink } from "../link.js";

const caches = [];
afterEach(() => { caches.splice(0).forEach(cache => cache.close()); });
async function setup() {
  const cache = await openCache(`payments-${crypto.randomUUID()}`);
  caches.push(cache);
  const tally = createTally({ question: "Dinner?", names: ["A", "B"], me: "A" });
  const rateFor = vi.fn(async (_day, currency) => ({ rate: currency === "USD" ? 2 : 1, estimated: false }));
  const fields = { category: 2, amount: 1000, currency: "USD", paidOn: 20400, participants: tally.members.map(member => member.id) };
  const payment = await recordPayment(cache, tally, { ...fields, rateFor });
  rateFor.mockClear();
  return { cache, tally, fields, payment, rateFor };
}

describe("payment workflows", () => {
  it("keeps the locked rate for category and participant edits, and persists the correction", async () => {
    const { cache, tally, fields, payment, rateFor } = await setup();
    await updatePayment(cache, tally, payment, { ...fields, category: 7, participants: [tally.me.member] }, { rateFor });
    expect(rateFor).not.toHaveBeenCalled();
    const saved = await cache.loadTally(tally.id);
    expect(paymentState(saved, payment.w, payment.s)).toMatchObject({ k: 7, v: 500, p: [tally.me.member] });
  });

  it.each([
    { amount: 2000 }, { currency: "EUR" }, { paidOn: 20399 },
  ])("revalues an edit when money or its date changes: %j", async changed => {
    const { cache, tally, fields, payment, rateFor } = await setup();
    rateFor.mockImplementation(async (_day, currency) => ({ rate: currency === "USD" ? 4 : 1, estimated: false }));
    await updatePayment(cache, tally, payment, { ...fields, ...changed }, { rateFor });
    const saved = paymentState(await cache.loadTally(tally.id), payment.w, payment.s);
    expect(saved.v).toBe(changed.currency === "EUR" ? 1000 : (changed.amount ?? 1000) / 4);
    expect(saved.pd).toBe(changed.paidOn ?? fields.paidOn);
  });

  it("does not change or save the tally when exchange-rate lookup fails", async () => {
    const { cache, tally, fields, payment } = await setup();
    const snapshot = structuredClone(tally);
    await expect(updatePayment(cache, tally, payment, { ...fields, amount: 2000 }, {
      rateFor: async () => { throw new Error("offline"); },
    })).rejects.toThrow("offline");
    expect(tally).toEqual(snapshot);
    expect(await cache.loadTally(tally.id)).toEqual(snapshot);
  });

  it("persists the edit and resolution when accepting a disputed correction", async () => {
    const { cache, tally, fields, payment, rateFor } = await setup();
    const other = structuredClone(tally);
    other.me = { member: tally.members[1].id, writer: "bbbbbbbb" };
    other.writers[other.me.writer] = { member: other.me.member, summary: { s: 0, h: "0000000000000000", n: {}, c: {} } };
    const dispute = await askAbout(other, [payment.w, payment.s], "category");
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const link = await encodeLink(other, key, { full: true });
    mergePayload(tally, (await decodeLink(link.url, key)).payload);
    await updatePayment(cache, tally, payment, { ...fields, category: 7 }, { dispute, rateFor });
    const saved = await cache.loadTally(tally.id);
    expect(openDisputes(saved)).toEqual([]);
    expect(paymentState(saved, payment.w, payment.s).k).toBe(7);
    expect(rateFor).not.toHaveBeenCalled();
  });

  it("propagates persistence failures instead of reporting success", async () => {
    const tally = createTally({ question: "Dinner?", names: ["A", "B"], me: "A" });
    await expect(changeTally({ saveTally: async () => { throw new Error("quota"); } }, tally, () => 1)).rejects.toThrow("quota");
  });
});
