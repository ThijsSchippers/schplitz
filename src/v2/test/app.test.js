// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { openCache } from "../cache.js";
import {
  startTally, openLink, unlockLink, completeJoin, recordPayment, prepareShare, markShared, unsharedCount,
  defaultCurrency, recentCurrencies, valueInTallyCurrency, v1Status, convertDeviceV1, STICKY_CURRENCY_MS,
} from "../app.js";
import { balance, whoseTurn, notMe, logOf, addPayment } from "../tally.js";
import { decodeLink } from "../link.js";

const TODAY = 20_400;
const COFFEE = 7, MEALS = 2;
const ORIGIN = "https://schplitz.com/v2";
const rates = { EUR: 1, USD: 1.1, THB: 38 };
const rateFor = async (_iso, c) => ({ rate: rates[c], estimated: false });

const phone = () => openCache(`test-${crypto.randomUUID()}`);
const memoryStorage = (init = {}) => {
  const data = { ...init };
  return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, data };
};

async function pairOnTwoPhones() {
  const sofiaPhone = await phone(), liamPhone = await phone();
  const { tally: sofia, key } = await startTally(sofiaPhone, { question: "Where did we meet?", answer: "Lisbon", myName: "Sofia", friendNames: ["Liam"] });
  const invite = await prepareShare(sofia, key, { origin: ORIGIN, today: TODAY });
  const opened = await openLink(liamPhone, invite.url);
  expect(opened.kind).toBe("join");
  const unlocked = await unlockLink(liamPhone, invite.url, " lisbon ");
  const liamId = unlocked.payload.m.find(([, n]) => n === "Liam")[0];
  const { tally: liam } = await completeJoin(liamPhone, unlocked, liamId);
  return { sofiaPhone, liamPhone, sofia, liam, key };
}

describe("the cache", () => {
  it("remembers tallies and keys, and can forget them", async () => {
    const { sofiaPhone, sofia } = await pairOnTwoPhones();
    const [cached] = await sofiaPhone.listTallies();
    expect(cached.id).toBe(sofia.id);
    expect(cached.local.sharedSeq).toBe(0);
    const key = await sofiaPhone.loadKey(sofia.id);
    expect(key.extractable).toBe(false);
    await sofiaPhone.forgetTally(sofia.id);
    expect(await sofiaPhone.loadTally(sofia.id)).toBeNull();
    expect(await sofiaPhone.loadKey(sofia.id)).toBeNull();
  });

  it("lists the most recently seen tally first", async () => {
    const cache = await phone();
    const a = await startTally(cache, { question: "q1", answer: "a", myName: "A", friendNames: ["B"] });
    await new Promise(r => { setTimeout(r, 5); });
    const b = await startTally(cache, { question: "q2", answer: "a", myName: "A", friendNames: ["C"] });
    expect((await cache.listTallies()).map(t => t.id)).toEqual([b.tally.id, a.tally.id]);
  });
});

describe("two phones, start to finish", () => {
  it("invite, join, pay, share, receive, dispute", async () => {
    const { sofiaPhone, liamPhone, sofia, liam, key } = await pairOnTwoPhones();
    expect(liam.members.map(m => m.name)).toEqual(["Sofia", "Liam"]);

    // Sofia pays for coffee and shares.
    await recordPayment(sofiaPhone, sofia, { category: COFFEE, amount: 740, currency: "EUR", paidOn: TODAY, rateFor });
    expect(unsharedCount(sofia)).toBe(1);
    const share = await prepareShare(sofia, key, { origin: ORIGIN, today: TODAY });
    expect(share.url.startsWith(`${ORIGIN}/#s=5.`)).toBe(true);
    await markShared(sofiaPhone, sofia, share);
    expect(unsharedCount(sofia)).toBe(0);

    // Liam's phone already knows the tally: no answer needed.
    const received = await openLink(liamPhone, share.url);
    expect(received.kind).toBe("merged");
    expect(received.report.involvingMe).toHaveLength(1);
    expect(whoseTurn(received.tally).member).toBe(received.tally.me.member);

    // He says he wasn't there, and Sofia's phone (reloaded from its cache) sees it.
    const pay = received.report.involvingMe[0];
    await notMe(received.tally, [pay.w, pay.s], TODAY);
    const back = await prepareShare(received.tally, key, { origin: ORIGIN, today: TODAY });
    const onSofia = await openLink(sofiaPhone, back.url);
    expect(Object.values(balance(onSofia.tally)).every(v => v === 0)).toBe(true);
    expect(balance(await sofiaPhone.loadTally(sofia.id))).toEqual(balance(onSofia.tally));
  });

  it("a wrong answer is refused when joining", async () => {
    const sofiaPhone = await phone(), liamPhone = await phone();
    const { tally, key } = await startTally(sofiaPhone, { question: "Where?", answer: "lisbon", myName: "Sofia", friendNames: ["Liam"] });
    const { url } = await prepareShare(tally, key, { origin: ORIGIN });
    await expect(unlockLink(liamPhone, url, "porto")).rejects.toMatchObject({ code: "cannot-decrypt" });
  });
});

describe("fixes from the second code review", () => {
  it("a link prepared right after a change includes it", async () => {
    const { liam, key } = await pairOnTwoPhones();
    const pending = addPayment(liam, { category: COFFEE, amount: 640 });   // not awaited, like a quick tap
    const { url } = await prepareShare(liam, key, { origin: ORIGIN });
    await pending;
    const { payload } = await decodeLink(url, key);
    expect(payload.e.some(e => e.t === "pay" && e.a === 640)).toBe(true);
  });

  it("tells other tabs when a tally is saved or removed", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const tabA = await openCache(name), tabB = await openCache(name);
    const heard = [];
    const stop = tabB.onOtherTabChange(id => heard.push(id));
    const { tally } = await startTally(tabA, { question: "q", answer: "a", myName: "A", friendNames: ["B"] });
    await tabA.forgetTally(tally.id);
    await new Promise(r => { setTimeout(r, 20); });
    expect(heard).toEqual([tally.id, tally.id]);
    stop(); tabA.close(); tabB.close();
  });
});

describe("currencies", () => {
  it("locks the value in the tally currency at the payment date", async () => {
    const cache = await phone();
    const { tally } = await startTally(cache, { question: "q", answer: "a", myName: "A", friendNames: ["B"] });
    expect(await valueInTallyCurrency(tally, 124000, "THB", TODAY, rateFor)).toEqual({ value: 3263, estimated: false });
    expect(await valueInTallyCurrency(tally, 1, "THB", TODAY, rateFor)).toEqual({ value: 1, estimated: false });
  });

  it("keeps a foreign currency selected for 12 hours, then goes back", async () => {
    const cache = await phone();
    const { tally } = await startTally(cache, { question: "q", answer: "a", myName: "A", friendNames: ["B"] });
    expect(defaultCurrency(tally)).toBe("EUR");
    await recordPayment(cache, tally, { category: MEALS, amount: 50_000, currency: "THB", paidOn: TODAY, rateFor });
    expect(defaultCurrency(tally)).toBe("THB");
    expect(defaultCurrency(tally, Date.now() + STICKY_CURRENCY_MS + 1)).toBe("EUR");
    await recordPayment(cache, tally, { category: MEALS, amount: 900, currency: "USD", paidOn: TODAY, rateFor });
    expect(recentCurrencies(tally)).toEqual(["USD", "THB"]);
    await recordPayment(cache, tally, { category: MEALS, amount: 900, currency: "EUR", paidOn: TODAY, rateFor });
    expect(defaultCurrency(tally)).toBe("EUR");   // paying in the tally currency ends the 12 hours
  });
});

describe("bringing in the v1 tally on this phone", () => {
  const v1 = (extra = {}) => JSON.stringify({
    initialized: true, myName: "Sofia", otherName: "Liam", securityQuestion: "Where did we meet?",
    statuses: {}, settlements: {}, expenses: [
      { id: "lz0abc12-xyz", description: "koffie", amount: 7.4, currency: "EUR", paidBy: "Sofia", date: "2026-03-14" },
      { id: "lz0abc99-xyz", description: "bier", amount: 24, currency: "EUR", paidBy: "Liam", date: "2026-03-15" },
    ], ...extra,
  });

  it("converts once, scrubs a plain-text answer, and can bring the data in again", async () => {
    const cache = await phone();
    const storage = memoryStorage({ schplitzExpenses: v1({ securityAnswer: "lisbon" }) });
    const status = await v1Status(cache, storage);
    expect(status).toMatchObject({ needsAnswer: false, converted: false, names: ["Sofia", "Liam"] });

    const first = await convertDeviceV1(cache, { storage, rateFor });
    expect(first.existing).toBe(false);
    expect(JSON.parse(storage.data.schplitzExpenses).securityAnswer).toBeUndefined();
    expect(JSON.parse(storage.data.schplitzExpenses).expenses).toHaveLength(2);
    expect(await v1Status(cache, storage)).toMatchObject({ converted: true, tallyId: first.tally.id });

    const again = await convertDeviceV1(cache, { storage, answer: "lisbon", rateFor });
    expect(again).toMatchObject({ existing: true, added: 0 });
    expect(logOf(again.tally, Object.keys(again.tally.writers).find(w => again.tally.writers[w].legacy && !again.tally.writers[w].provisional))).toHaveLength(1);
  });

  it("needs the answer when v1 didn't store it, and recognises a mismatched answer later", async () => {
    const cache = await phone();
    const storage = memoryStorage({ schplitzExpenses: v1() });
    expect((await v1Status(cache, storage)).needsAnswer).toBe(true);
    await expect(convertDeviceV1(cache, { storage, rateFor })).rejects.toMatchObject({ code: "invalid-input" });
    const { tally } = await convertDeviceV1(cache, { storage, answer: "lisboa", rateFor });   // typo

    // Liam converted with the right answer and shares his first link.
    const liamPhone = await phone();
    const liamStorage = memoryStorage({ schplitzExpenses: JSON.stringify({ ...JSON.parse(v1()), myName: "Liam", otherName: "Sofia" }) });
    const liam = await convertDeviceV1(liamPhone, { storage: liamStorage, answer: "lisbon", rateFor });
    const { url } = await prepareShare(liam.tally, liam.key, { origin: ORIGIN });
    expect((await openLink(cache, url)).kind).toBe("join");
    await expect(unlockLink(cache, url, "lisboa")).rejects.toMatchObject({ code: "answer-mismatch" });
    expect(tally.id).not.toBe(liam.tally.id);
  });

  it("can be brought in again after removing it, but not with a different answer", async () => {
    const cache = await phone();
    const storage = memoryStorage({ schplitzExpenses: v1() });
    const { tally } = await convertDeviceV1(cache, { storage, answer: "lisbon", rateFor });
    await expect(convertDeviceV1(cache, { storage, answer: "porto", rateFor })).rejects.toMatchObject({ code: "answer-mismatch" });
    expect(await cache.listTallies()).toHaveLength(1);
    await cache.forgetTally(tally.id);
    expect((await v1Status(cache, storage)).converted).toBe(false);
    expect((await convertDeviceV1(cache, { storage, answer: "lisbon", rateFor })).tally.id).toBe(tally.id);
  });

  it("ignores v1 data it can't convert", async () => {
    const cache = await phone();
    expect(await v1Status(cache, memoryStorage())).toBeNull();
    expect(await v1Status(cache, memoryStorage({ schplitzExpenses: JSON.stringify({ myName: "x" }) }))).toBeNull();
  });
});
