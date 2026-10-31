// @vitest-environment node
import { describe, it, expect } from "vitest";
import { encrypt, encryptCompressed, compressToUrl } from "../../utils.js";
import {
  readV1Storage, convertFromDevice, shortId, reimportFromDevice, readV1Share, openV1Share, applyV1Share,
  looksLikeMismatchedAnswer, deriveV1Identity,
} from "../migrate.js";
import {
  balance, verify, mergePayload, joinTally, adoptProvisional, addPayment, setFreshStart, freshStart,
  recategorize, categoryTotals, categoryOf, logOf,
} from "../tally.js";
import { encodeLink, decodeLink, readHeader, deriveKey } from "../link.js";

const Q = "Where did we meet?";
const ANSWER = "lisbon";
const TODAY = 20_757;
const RATES = { EUR: 1, USD: 1.1, THB: 38, ALL: 100, AED: 4 };
const rateFor = async (_date, c) => ({ rate: RATES[c], estimated: c === "AED" || c === "ALL" });

// v1 IDs: creation time in base 36, then random.
let clock = Date.UTC(2026, 2, 1);
const v1id = () => `${(clock += 60_000).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const exp = (paidBy, description, amount, currency = "EUR", date = "2026-03-14") =>
  ({ id: v1id(), description, amount, currency, paidBy, date });

const storage = (myName, otherName, expenses, extra = {}) => JSON.stringify({
  initialized: true, myName, otherName, securityQuestion: Q, statuses: { [myName]: "done" }, settlements: {}, expenses, ...extra,
});

// A v4 link exactly as v1's handleExport builds it.
async function v4Link(myName, otherName, expenses, settlement) {
  const data = { expenses: expenses.map(e => ({ i: e.id, d: e.description, a: e.amount, c: e.currency, p: e.paidBy, t: e.date })), status: "done" };
  if (settlement) data.settlement = settlement;
  const payload = { v: 4, question: Q, names: [myName, otherName], encrypted: await encryptCompressed(JSON.stringify(data), ANSWER) };
  return `https://schplitz.com/#share=${await compressToUrl(JSON.stringify(payload))}`;
}
async function v3Text(myName, otherName, expenses) {
  const data = { expenses: expenses.map(e => ({ i: e.id, d: e.description, a: e.amount, c: e.currency, p: e.paidBy, t: e.date })) };
  return JSON.stringify({ v: 3, question: Q, names: [myName, otherName], encrypted: await encrypt(JSON.stringify(data), ANSWER) });
}

const idOf = (t, name) => t.members.find(m => m.name === name).id;
const legacyWriterOf = (t, name) => Object.entries(t.writers).find(([, w]) => w.legacy && w.member === idOf(t, name))[0];
const fullLink = (t, key) => encodeLink(t, key, { full: true, today: TODAY }).then(r => r.url);
const link = (t, key) => encodeLink(t, key, { today: TODAY }).then(r => r.url);
async function receive(url, key, phone) { const { payload } = await decodeLink(url, key); return mergePayload(phone, payload); }

// v1's own balance formula, with the same rates.
function v1Balance(expenses, myName) {
  let my = 0, ot = 0;
  for (const e of expenses) { const eur = e.amount / RATES[e.currency]; if (e.paidBy === myName) my += eur; else ot += eur; }
  return my - (my + ot) / 2;
}

// Two phones whose v1 copies have drifted apart, the way v1 allowed.
function divergedPhones() {
  const shared = [
    exp("Sofia", "koffie", 7.4), exp("Liam", "Bier", 24), exp("Sofia", "Dinner at Lima", 86.5),
    exp("Liam", "Padel Sunday", 32), exp("Sofia", "Taxi home", 18.2, "USD"), exp("Liam", "Groceries", 41.35),
  ];
  const sofiaDeletedOwn = shared[2];        // Sofia deleted it; Liam's copy still has it
  const liamDeletedSofias = shared[0];      // v1 let Liam delete Sofia's entry on his phone
  const sofiaUnshared = exp("Sofia", "Cinema", 25);
  const liamUnshared = exp("Liam", "Drinks", 19.5);
  const sofiaPhone = [...shared.filter(e => e !== sofiaDeletedOwn), sofiaUnshared];
  const liamPhone = [...shared.filter(e => e !== liamDeletedSofias), liamUnshared];
  return {
    sofiaRaw: storage("Sofia", "Liam", sofiaPhone), liamRaw: storage("Liam", "Sofia", liamPhone),
    sofiaDeletedOwn, liamDeletedSofias, sofiaUnshared, liamUnshared,
    truth: [...sofiaPhone.filter(e => e.paidBy === "Sofia"), ...liamPhone.filter(e => e.paidBy === "Liam")],
  };
}

describe("reading v1 storage", () => {
  it("recognises every shape that exists", () => {
    expect(readV1Storage(null).kind).toBe("none");
    expect(readV1Storage("{oops").kind).toBe("unreadable");
    expect(readV1Storage(JSON.stringify({ myName: "Sofia", expenses: [] })).kind).toBe("A3");
    expect(readV1Storage(storage("Sofia", "Liam", [])).kind).toBe("A1");
    expect(readV1Storage(storage("Sofia", "Liam", [], { securityAnswer: ANSWER })).kind).toBe("A2");
  });

  it("asks for the answer when it isn't stored", async () => {
    const r = await convertFromDevice(storage("Sofia", "Liam", [exp("Sofia", "koffie", 3)]), { rateFor });
    expect(r).toMatchObject({ kind: "A1", needsAnswer: true, question: Q });
  });

  it("uses a stored plain-text answer, then removes it and keeps the rest", async () => {
    const raw = storage("Sofia", "Liam", [exp("Sofia", "koffie", 3)], { securityAnswer: ANSWER });
    const r = await convertFromDevice(raw, { rateFor });
    expect(r.tally).toBeTruthy();
    const scrubbed = JSON.parse(r.scrubbedStorage);
    expect(scrubbed.securityAnswer).toBeUndefined();
    expect(scrubbed.expenses).toHaveLength(1);
  });

  it("lists what it can't convert instead of dropping it", async () => {
    const bad = { ...exp("Sofia", "x", 5), amount: -1 };
    const stranger = exp("Mallory", "huh", 5);
    const r = await convertFromDevice(storage("Sofia", "Liam", [exp("Sofia", "ok", 5), bad, stranger]), { answer: ANSWER, rateFor });
    expect(r.tally.legacy.invalid).toHaveLength(1);
    expect(r.tally.legacy.unassigned.map(u => u.paidBy)).toEqual(["Mallory"]);
  });
});

describe("converting entries", () => {
  it("keeps amounts in their own currency and locks the euro value", async () => {
    const r = await convertFromDevice(storage("Sofia", "Liam", [
      exp("Sofia", "pad thai", 1240, "THB"), exp("Sofia", "byrek", 900, "ALL"), exp("Sofia", "odd", 10.005),
    ]), { answer: ANSWER, rateFor });
    const entries = logOf(r.tally, legacyWriterOf(r.tally, "Sofia"));
    expect(entries.map(e => [e.a, e.c, e.v])).toEqual([[124000, "THB", 3263], [900, "ALL", 900], [1001, "EUR", 1001]]);
    expect(entries[1].e).toBe(1);                      // ALL has no live rate: marked estimated
    expect(entries.every(e => e.k === 0)).toBe(true);  // everything starts as Something else
  });

  it("keeps descriptions and settlement messages on this phone only", async () => {
    const r = await convertFromDevice(storage("Sofia", "Liam", [exp("Sofia", "Dinner at Lima", 40)],
      { settlements: { Liam: "My IBAN is NL00BANK0123456789" } }), { answer: ANSWER, rateFor });
    expect(Object.values(r.tally.legacy.notes)).toEqual(["Dinner at Lima"]);
    expect(r.tally.legacy.settlements.Liam).toMatch(/IBAN/);
    const { payload } = await decodeLink(await fullLink(r.tally, r.key), r.key);
    expect(JSON.stringify(payload)).not.toMatch(/Lima|IBAN/);
  });
});

describe("two phones meet in the same v2 tally", () => {
  it("derive the same tally, members and old-history writers without talking", async () => {
    const a = await deriveV1Identity("Lisbon", Q, ["Sofia", "Liam"]);
    const b = await deriveV1Identity(" lis bon", Q, ["Liam", "Sofia"]);
    expect(a).toEqual(b);
    expect((await deriveV1Identity("porto", Q, ["Sofia", "Liam"])).tallyId).not.toBe(a.tallyId);
  });

  it("reconcile drifted copies: the payer's phone decides, and both end up identical", async () => {
    const p = divergedPhones();
    const sofia = (await convertFromDevice(p.sofiaRaw, { answer: ANSWER, rateFor })).tally;
    const { tally: liam, key } = await convertFromDevice(p.liamRaw, { answer: "Lisbon", rateFor });
    expect(liam.id).toBe(sofia.id);

    const fromSofia = await fullLink(sofia, key);
    const fromLiam = await fullLink(liam, key);
    const onLiam = await receive(fromSofia, key, liam);
    const onSofia = await receive(fromLiam, key, sofia);

    // Liam's phone: Sofia's own version replaces his copy of her entries.
    const [replaced] = onLiam.replaced;
    expect(replaced.added).toEqual(expect.arrayContaining([shortId(p.sofiaUnshared.id), shortId(p.liamDeletedSofias.id)]));
    expect(replaced.removed).toEqual([shortId(p.sofiaDeletedOwn.id)]);
    // ...and he's asked about his own entry that Sofia's phone didn't have.
    expect(onLiam.review[0].theyMiss).toEqual([shortId(p.liamUnshared.id)]);
    expect(onSofia.replaced[0].added).toEqual([shortId(p.liamUnshared.id)]);

    expect(balance(liam)).toEqual(balance(sofia));
    expect(await verify(liam)).toEqual([]);
    expect(await verify(sofia)).toEqual([]);

    // Same balance v1 would show for the reconciled history, within a cent per entry.
    const v1 = v1Balance(p.truth, "Sofia") * 100;
    expect(Math.abs(balance(sofia)[idOf(sofia, "Sofia")] - v1)).toBeLessThanOrEqual(p.truth.length);
  });

  it("a mistyped answer is recognised, not treated as a new tally", async () => {
    const p = divergedPhones();
    const sofia = (await convertFromDevice(p.sofiaRaw, { answer: ANSWER, rateFor })).tally;
    const typo = await convertFromDevice(p.liamRaw, { answer: "lisboa", rateFor });
    const header = readHeader(await fullLink(typo.tally, typo.key));
    expect(looksLikeMismatchedAnswer(sofia, header)).toBe(true);
  });

  it("a phone that lost its v1 data takes over the other's copy of its history", async () => {
    const p = divergedPhones();
    const { tally: sofia, key } = await convertFromDevice(p.sofiaRaw, { answer: ANSWER, rateFor });
    // Sofia taps "Send full copy", which includes her copy of Liam's old entries.
    const url = (await encodeLink(sofia, key, { full: true, includeProvisional: true, budget: 10_000 })).url;
    const { header, payload } = await decodeLink(url, await deriveKey(ANSWER, readHeader(url).tallyId));
    const { tally: liam } = joinTally(header, payload, idOf(sofia, "Liam"));
    const lw = legacyWriterOf(liam, "Liam");
    expect(liam.writers[lw].provisional).toBe(true);
    expect(logOf(liam, lw)).toHaveLength(logOf(sofia, lw).length);
    adoptProvisional(liam, lw);

    const sofiasLines = logOf(sofia, lw).length;
    await receive(await fullLink(liam, key), key, sofia);
    expect(sofia.writers[lw].provisional).toBe(false);
    expect(logOf(sofia, lw)).toHaveLength(sofiasLines);   // nothing lost on Sofia's phone
    expect(balance(sofia)).toEqual(balance(liam));
  });
});

describe("old links after the upgrade", () => {
  async function setup() {
    const e1 = [exp("Sofia", "koffie", 7.4), exp("Liam", "bier", 24)];
    const sofiaLinkOld = await v4Link("Sofia", "Liam", e1);
    const e2 = [...e1, exp("Sofia", "padel", 30)];
    const sofiaLinkNew = await v4Link("Sofia", "Liam", e2, "Tikkie me");
    const liam = (await convertFromDevice(storage("Liam", "Sofia", e1), { answer: ANSWER, rateFor })).tally;
    return { liam, sofiaLinkOld, sofiaLinkNew };
  }
  const open = async (url) => openV1Share(await readV1Share(url), ANSWER);

  it("before the first v2 sync, a newer link refreshes the other person's entries only", async () => {
    const { liam, sofiaLinkNew } = await setup();
    const before = logOf(liam, legacyWriterOf(liam, "Liam")).length;
    const r = await applyV1Share(liam, await open(sofiaLinkNew), { myName: "Liam", answer: ANSWER, rateFor });
    expect(r.outcome).toBe("updated");
    expect(logOf(liam, legacyWriterOf(liam, "Sofia"))).toHaveLength(2);
    expect(logOf(liam, legacyWriterOf(liam, "Liam"))).toHaveLength(before);
    expect(liam.legacy.settlements).toEqual({});   // settlement texts from links aren't imported into an existing tally
  });

  it("an older link changes nothing", async () => {
    const { liam, sofiaLinkOld, sofiaLinkNew } = await setup();
    await applyV1Share(liam, await open(sofiaLinkNew), { myName: "Liam", answer: ANSWER, rateFor });
    const r = await applyV1Share(liam, await open(sofiaLinkOld), { myName: "Liam", answer: ANSWER, rateFor });
    expect(r.outcome).toBe("older");
    expect(logOf(liam, legacyWriterOf(liam, "Sofia"))).toHaveLength(2);
  });

  it("after the first v2 sync, old links are ignored", async () => {
    const { liam, sofiaLinkNew } = await setup();
    const sofia = (await convertFromDevice(storage("Sofia", "Liam", (await open(sofiaLinkNew)).expenses), { answer: ANSWER, rateFor })).tally;
    const key = await deriveKey(ANSWER, liam.id);
    await receive(await fullLink(sofia, key), key, liam);
    const r = await applyV1Share(liam, await open(sofiaLinkNew), { myName: "Liam", answer: ANSWER, rateFor });
    expect(r.outcome).toBe("up-to-date");
  });

  it("on a phone without the tally, an old link creates it — v3 text too", async () => {
    const r = await applyV1Share(null, await openV1Share(await readV1Share(
      await v3Text("Sofia", "Liam", [exp("Sofia", "koffie", 7.4), exp("Liam", "bier", 24)])), ANSWER),
      { myName: "Liam", answer: ANSWER, rateFor });
    expect(r.outcome).toBe("created");
    expect(balance(r.tally)[idOf(r.tally, "Liam")]).toBe(830);
  });

  it("a link from a different tally is kept apart", async () => {
    const { liam } = await setup();
    const other = await openV1Share(await readV1Share(await v4Link("Liam", "Noor", [exp("Noor", "x", 5)])), ANSWER);
    const r = await applyV1Share(liam, other, { myName: "Liam", answer: ANSWER, rateFor });
    expect(r.outcome).toBe("different-tally");
  });
});

describe("after converting", () => {
  async function synced() {
    const p = divergedPhones();
    const { tally: sofia, key } = await convertFromDevice(p.sofiaRaw, { answer: ANSWER, rateFor });
    const liam = (await convertFromDevice(p.liamRaw, { answer: ANSWER, rateFor })).tally;
    await receive(await fullLink(sofia, key), key, liam);
    await receive(await fullLink(liam, key), key, sofia);
    return { sofia, liam, key };
  }

  it("'start fresh' stops old entries counting, on every phone, even after a wipe", async () => {
    const { sofia, liam, key } = await synced();
    await setFreshStart(sofia, true, TODAY);
    await addPayment(sofia, { category: 7, amount: 600, day: TODAY });
    expect(balance(sofia)[idOf(sofia, "Liam")]).toBe(-300);

    await receive(await link(sofia, key), key, liam);
    expect(balance(liam)).toEqual(balance(sofia));

    const url = await link(sofia, key);
    const { header, payload } = await decodeLink(url, key);
    const { tally: restored } = joinTally(header, payload, idOf(sofia, "Liam"));
    expect(freshStart(restored)).toBe(true);
    expect(balance(restored)).toEqual(balance(sofia));

    await setFreshStart(liam, false, TODAY + 1);   // Liam disagrees: last choice wins
    await receive(await link(liam, key), key, sofia);
    expect(freshStart(sofia)).toBe(false);
  });

  it("sorting your old entries changes categories, not the balance, and syncs", async () => {
    const { sofia, liam, key } = await synced();
    const before = balance(sofia);
    const lw = legacyWriterOf(sofia, "Sofia");
    const refs = logOf(sofia, lw).filter(e => sofia.legacy.notes[e.l] === "Cinema").map(e => [e.w, e.s]);
    await recategorize(sofia, refs, 10, TODAY);
    expect(balance(sofia)).toEqual(before);
    expect(categoryTotals(sofia)[10]).toEqual([1, 2500]);

    await receive(await link(sofia, key), key, liam);
    expect(categoryOf(liam, ...refs[0])).toBe(10);
    expect(categoryTotals(liam)[10]).toEqual([1, 2500]);

    const theirs = logOf(sofia, legacyWriterOf(sofia, "Liam")).map(e => [e.w, e.s]);
    await expect(recategorize(sofia, theirs.slice(0, 1), 6, TODAY)).rejects.toThrow(/your own/);
  });

  it("bringing the device data in again adds only what's new", async () => {
    const raw = storage("Sofia", "Liam", [exp("Sofia", "koffie", 4)]);
    const { tally } = await convertFromDevice(raw, { answer: ANSWER, rateFor });
    expect((await reimportFromDevice(tally, raw, { rateFor })).added).toBe(0);
    const later = JSON.parse(raw); later.expenses.push(exp("Sofia", "from an old tab", 10));
    expect((await reimportFromDevice(tally, JSON.stringify(later), { rateFor })).added).toBe(1);
    expect((await reimportFromDevice(tally, JSON.stringify(later), { rateFor })).added).toBe(0);
    expect(balance(tally)[idOf(tally, "Liam")]).toBe(-700);
  });
});
