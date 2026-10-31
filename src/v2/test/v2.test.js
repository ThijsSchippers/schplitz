// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  createTally, joinTally, mergePayload, addPayment, editPayment, voidPayment, addPaidBack,
  notMe, askAbout, acceptDispute, keepAsIs, openDisputes, balance, whoseTurn, usualAmount,
  socialUnits, verify, split, MAX_MEMBERS,
} from "../tally.js";
import { deriveKey, encodeLink, decodeLink, readHeader, selectWindow, LINK_BUDGET } from "../link.js";

const TODAY = 20_400;            // a fixed day number, so windows are deterministic
const COFFEE = 7, MEALS = 2, DRINKS = 6, STAYS = 1;

const sumOf = (nets) => Object.values(nets).reduce((a, b) => a + b, 0);
const memberId = (t, name) => t.members.find(m => m.name === name).id;

// Opens a link on a phone: joins if the tally is new there, merges otherwise.
async function open(url, key, phone, name) {
  const { header, payload } = await decodeLink(url, key);
  if (phone) return { tally: phone, report: mergePayload(phone, payload) };
  const id = payload.m.find(([, n]) => n === name)[0];
  return joinTally(header, payload, id);
}

const send = (t, key, opts = {}) => encodeLink(t, key, { today: TODAY, ...opts }).then(r => r.url);

async function pair() {
  const sofia = createTally({ question: "Where did we meet?", names: ["Sofia", "Liam"], me: "Sofia" });
  const key = await deriveKey("Lisbon", sofia.id);
  const { tally: liam } = await open(await send(sofia, key), key, null, "Liam");
  return { sofia, liam, key };
}

async function group(names, me = names[0]) {
  const first = createTally({ question: "Club name?", names, me });
  const key = await deriveKey("smash", first.id);
  const phones = { [me]: first };
  for (const n of names.filter(n => n !== me)) phones[n] = (await open(await send(first, key), key, null, n)).tally;
  return { phones, key };
}

describe("money", () => {
  it("splits in whole cents and never loses a cent", () => {
    const s = split(1000, ["c", "a", "b"]);
    expect(sumOf(s)).toBe(1000);
    expect(s).toEqual({ a: 334, b: 333, c: 333 });
  });
});

describe("pair basics", () => {
  it("a shared coffee puts the other person behind", async () => {
    const { sofia } = await pair();
    await addPayment(sofia, { category: COFFEE, amount: 740, day: TODAY });
    const b = balance(sofia);
    expect(b[memberId(sofia, "Sofia")]).toBe(370);
    expect(b[memberId(sofia, "Liam")]).toBe(-370);
    expect(whoseTurn(sofia)).toMatchObject({ member: memberId(sofia, "Liam"), aboutEven: true });
  });

  it("says 'about even' only below €5", async () => {
    const { sofia } = await pair();
    await addPayment(sofia, { category: MEALS, amount: 998, day: TODAY });
    expect(whoseTurn(sofia).aboutEven).toBe(true);     // 4.99 behind
    await addPayment(sofia, { category: COFFEE, amount: 2, day: TODAY });
    expect(whoseTurn(sofia).aboutEven).toBe(false);    // 5.00 behind
  });

  it("only lets you change your own payments", async () => {
    const { sofia, liam, key } = await pair();
    await addPayment(sofia, { category: COFFEE, amount: 500, day: TODAY });
    await open(await send(sofia, key), key, liam);
    await expect(editPayment(liam, 1, { a: 1, v: 1 })).rejects.toThrow(/own payments/);
    await editPayment(sofia, 1, { a: 800, v: 800 }, TODAY);
    expect(balance(sofia)[memberId(sofia, "Liam")]).toBe(-400);
    await voidPayment(sofia, 1, TODAY);
    expect(balance(sofia)[memberId(sofia, "Liam")]).toBe(0);
  });

  it("records a paid-back transfer", async () => {
    const { sofia } = await pair();
    await addPayment(sofia, { category: STAYS, amount: 20000, day: TODAY });
    await addPaidBack(sofia, { from: memberId(sofia, "Liam"), to: memberId(sofia, "Sofia"), value: 10000, day: TODAY });
    expect(balance(sofia)[memberId(sofia, "Liam")]).toBe(0);
  });

  it("keeps foreign amounts and locks the tally-currency value", async () => {
    const { sofia } = await pair();
    await addPayment(sofia, { category: MEALS, amount: 124000, currency: "THB", value: 3260, day: TODAY });
    expect(balance(sofia)[memberId(sofia, "Liam")]).toBe(-1630);
    await expect(addPayment(sofia, { category: MEALS, amount: 100, currency: "USD", day: TODAY })).rejects.toThrow(/tally currency/);
  });
});

describe("links", () => {
  it("round-trip: the other phone ends up with the same balance", async () => {
    const { sofia, liam, key } = await pair();
    await addPayment(sofia, { category: DRINKS, amount: 2400, day: TODAY });
    const { report } = await open(await send(sofia, key), key, liam);
    expect(balance(liam)).toEqual(balance(sofia));
    expect(report.involvingMe).toHaveLength(1);
  });

  it("shows the question before decrypting, and rejects a wrong answer", async () => {
    const { sofia } = await pair();
    const key = await deriveKey("Lisbon", sofia.id);
    const url = await send(sofia, key);
    expect(readHeader(url).question).toBe("Where did we meet?");
    expect(readHeader(url).tallyId).toBe(sofia.id);
    await expect(decodeLink(url, await deriveKey("Porto", sofia.id))).rejects.toThrow();
  });

  it("normalises the answer like v1 (case and spaces)", async () => {
    const { sofia } = await pair();
    const url = await send(sofia, await deriveKey("Lisbon", sofia.id));
    await expect(decodeLink(url, await deriveKey(" LIS bon ", sofia.id))).resolves.toBeTruthy();
  });

  it("rejects a header swapped onto another tally's payload", async () => {
    const { sofia, key } = await pair();
    const url = await send(sofia, key);
    const forged = url.replace(/Where|V2hlcm/, "X");
    await expect(decodeLink(forged, key)).rejects.toThrow();
  });

  it("order doesn't matter, and opening a link twice changes nothing", async () => {
    const { sofia, liam, key } = await pair();
    await addPayment(sofia, { category: COFFEE, amount: 600, day: TODAY });
    const first = await send(sofia, key);
    await addPayment(sofia, { category: MEALS, amount: 4000, day: TODAY });
    const second = await send(sofia, key);
    await open(second, key, liam);
    await open(first, key, liam);   // an old link can't roll anything back
    await open(second, key, liam);
    expect(balance(liam)).toEqual(balance(sofia));
  });

  it("both add at the same time: after swapping links, both phones agree", async () => {
    const { sofia, liam, key } = await pair();
    await addPayment(sofia, { category: COFFEE, amount: 640, day: TODAY });
    await addPayment(liam, { category: DRINKS, amount: 1800, day: TODAY });
    const fromSofia = await send(sofia, key), fromLiam = await send(liam, key);
    await open(fromLiam, key, sofia);
    await open(fromSofia, key, liam);
    expect(balance(sofia)).toEqual(balance(liam));
    expect(balance(sofia)[memberId(sofia, "Sofia")]).toBe(320 - 900);
    expect(await verify(sofia)).toEqual([]);
    expect(await verify(liam)).toEqual([]);
  });

  it("a pair's link stays small after years of use", async () => {
    const { sofia, key } = await pair();
    for (let i = 0; i < 500; i++)
      await addPayment(sofia, { category: [COFFEE, DRINKS, MEALS][i % 3], amount: 300 + i, day: TODAY - 1500 + i * 3 });
    const { length } = await encodeLink(sofia, key, { today: TODAY });
    expect(length).toBeLessThan(1100);
  });
});

describe("the chat is the database", () => {
  it("a wiped phone gets the exact balance back from the latest link", async () => {
    const { sofia, liam, key } = await pair();
    for (let i = 0; i < 60; i++) {
      await addPayment(sofia, { category: COFFEE, amount: 500, day: TODAY - 120 + i * 2 });
      await addPayment(liam, { category: DRINKS, amount: 1700, day: TODAY - 119 + i * 2 });
    }
    await open(await send(liam, key), key, sofia);
    const expected = balance(sofia);

    // Liam's phone is wiped. He taps Sofia's latest link and types the answer again.
    const url = await send(sofia, key);
    const freshKey = await deriveKey("lisbon", readHeader(url).tallyId);
    const { tally: restored, returning } = await open(url, freshKey, null, "Liam");
    expect(returning).toBe(true);
    expect(balance(restored)).toEqual(expected);
    expect(restored.me.writer).not.toBe(liam.me.writer);   // a restored phone writes as a new writer

    // Recent history is back line by line; older entries aren't.
    const days = Object.values(restored.entries).map(e => e.d);
    expect(Math.min(...days)).toBeGreaterThanOrEqual(TODAY - 30 - 20);
    expect(Object.keys(restored.entries).length).toBeGreaterThanOrEqual(20);
  });

  it("over budget, older entries are left out but the balance stays exact", async () => {
    const names = ["Ana", "Ben", "Cas", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo"];
    const { phones, key } = await group(names);
    const ana = phones.Ana;
    for (let i = 0; i < 120; i++)
      await addPayment(ana, { category: [MEALS, DRINKS, COFFEE][i % 3], amount: 1000 + i, day: TODAY - 6 + (i % 7),
        participants: ana.members.slice(0, 2 + (i % 9)).map(m => m.id) });
    const r = await encodeLink(ana, key, { today: TODAY });
    expect(r.length).toBeLessThanOrEqual(LINK_BUDGET);
    expect(r.dropped).toBeGreaterThan(0);
    await open(r.url, key, phones.Jo);
    expect(balance(phones.Jo)).toEqual(balance(ana));
  });

  it("caps groups at 10", () => {
    const names = Array.from({ length: MAX_MEMBERS + 1 }, (_, i) => `P${i}`);
    expect(() => createTally({ question: "q", names, me: "P0" })).toThrow(/at most 10/);
  });
});

describe("corrections and disputes", () => {
  async function jessysDinner() {
    const { phones, key } = await group(["Jessy", "Sofia", "Liam", "Noor"]);
    const jessy = phones.Jessy;
    const pay = await addPayment(jessy, { category: MEALS, amount: 10000, day: TODAY });
    const url = await send(jessy, key);
    for (const n of ["Sofia", "Liam", "Noor"]) await open(url, key, phones[n]);
    return { phones, key, ref: [pay.w, pay.s] };
  }

  it("lists new payments that include you when a link arrives", async () => {
    const { phones, key } = await group(["Jessy", "Sofia", "Liam"]);
    await addPayment(phones.Jessy, { category: MEALS, amount: 10000, day: TODAY });
    const { report } = await open(await send(phones.Jessy, key), key, phones.Sofia);
    expect(report.involvingMe.map(e => e.v)).toEqual([10000]);
  });

  it("'Not me' applies straight away, on every phone", async () => {
    const { phones, key, ref } = await jessysDinner();
    const sofiaId = memberId(phones.Sofia, "Sofia");
    expect(balance(phones.Sofia)[sofiaId]).toBe(-2500);

    await notMe(phones.Sofia, ref, TODAY);
    expect(balance(phones.Sofia)[sofiaId]).toBe(0);
    expect(sumOf(balance(phones.Sofia))).toBe(0);

    const url = await send(phones.Sofia, key);
    for (const n of ["Jessy", "Liam", "Noor"]) await open(url, key, phones[n]);
    for (const n of ["Jessy", "Liam", "Noor"]) expect(balance(phones[n])).toEqual(balance(phones.Sofia));
    // €100 split 3 ways: one person gets the extra cent, decided by sorted member id, the same on every phone.
    const shares = ["Jessy", "Liam", "Noor"].map(n => memberId(phones.Liam, n));
    const nets = balance(phones.Liam);
    expect(shares.filter(id => id !== memberId(phones.Liam, "Jessy")).map(id => nets[id]).sort()).toEqual(
      shares.filter(id => id !== memberId(phones.Liam, "Jessy")).map(id => split(10000, shares)[id] * -1).sort());
    expect(openDisputes(phones.Jessy)).toHaveLength(1);
  });

  it("payer accepts: Sofia stays out, nothing is counted twice", async () => {
    const { phones, key, ref } = await jessysDinner();
    const d = await notMe(phones.Sofia, ref, TODAY);
    await open(await send(phones.Sofia, key), key, phones.Jessy);
    const afterNotMe = balance(phones.Jessy);

    await acceptDispute(phones.Jessy, [d.w, d.s], {}, TODAY);
    expect(balance(phones.Jessy)).toEqual(afterNotMe);
    expect(openDisputes(phones.Jessy)).toHaveLength(0);

    // A later fix to the amount still splits correctly among the three who were there.
    await editPayment(phones.Jessy, ref[1], { a: 9000, v: 9000 }, TODAY);
    expect(balance(phones.Jessy)[memberId(phones.Jessy, "Sofia")]).toBe(0);
    expect(balance(phones.Jessy)[memberId(phones.Jessy, "Liam")]).toBe(-3000);

    await open(await send(phones.Jessy, key), key, phones.Sofia);
    expect(balance(phones.Sofia)).toEqual(balance(phones.Jessy));
  });

  it("payer keeps it as is: Sofia is back in", async () => {
    const { phones, key, ref } = await jessysDinner();
    const before = balance(phones.Jessy);
    const d = await notMe(phones.Sofia, ref, TODAY);
    await open(await send(phones.Sofia, key), key, phones.Jessy);
    await keepAsIs(phones.Jessy, [d.w, d.s], TODAY);
    expect(balance(phones.Jessy)).toEqual(before);
    await open(await send(phones.Jessy, key), key, phones.Sofia);
    expect(balance(phones.Sofia)).toEqual(before);
  });

  it("'Ask about it' changes nothing until the payer fixes it", async () => {
    const { phones, key, ref } = await jessysDinner();
    const before = balance(phones.Liam);
    const q = await askAbout(phones.Liam, ref, "amount", TODAY);
    expect(balance(phones.Liam)).toEqual(before);
    await open(await send(phones.Liam, key), key, phones.Jessy);
    expect(openDisputes(phones.Jessy).map(e => e.q)).toEqual(["amount"]);
    await acceptDispute(phones.Jessy, [q.w, q.s], { a: 6000, v: 6000 }, TODAY);
    expect(openDisputes(phones.Jessy)).toHaveLength(0);
    expect(balance(phones.Jessy)[memberId(phones.Jessy, "Liam")]).toBe(-1500);
  });

  it("you can't dispute your own payment or one you weren't in", async () => {
    const { phones, ref } = await jessysDinner();
    await expect(notMe(phones.Jessy, ref)).rejects.toThrow(/your own/);
    await notMe(phones.Sofia, ref, TODAY);
    await expect(notMe(phones.Sofia, ref)).rejects.toThrow(/not part/);
  });

  it("an open dispute travels in every link, however old", async () => {
    const { phones, key } = await group(["Jessy", "Sofia"]);
    const old = await addPayment(phones.Jessy, { category: MEALS, amount: 5000, day: TODAY - 200 });
    for (let i = 0; i < 40; i++) await addPayment(phones.Jessy, { category: COFFEE, amount: 300, day: TODAY - 100 + i });
    await open(await send(phones.Jessy, key, { today: TODAY - 199 }), key, phones.Sofia);  // Sofia saw it back then
    await notMe(phones.Sofia, [old.w, old.s], TODAY);
    const { entries } = selectWindow(phones.Sofia, TODAY);
    expect(entries.some(e => e.w === old.w && e.s === old.s)).toBe(true);
    expect(entries.some(e => e.t === "notme")).toBe(true);
  });
});

describe("window and suggestions", () => {
  it("sends the last 30 days, and at least 20 entries", async () => {
    const { sofia } = await pair();
    for (let i = 0; i < 50; i++) await addPayment(sofia, { category: COFFEE, amount: 300, day: TODAY - 200 + i });
    expect(selectWindow(sofia, TODAY).entries).toHaveLength(20);
    for (let i = 0; i < 25; i++) await addPayment(sofia, { category: COFFEE, amount: 300, day: TODAY - 25 + i });
    expect(selectWindow(sofia, TODAY).entries).toHaveLength(25);
  });

  it("suggests a usual amount, except for Stays and Tickets", async () => {
    const { sofia } = await pair();
    await addPayment(sofia, { category: COFFEE, amount: 700, day: TODAY });
    await addPayment(sofia, { category: COFFEE, amount: 780, day: TODAY });
    await addPayment(sofia, { category: STAYS, amount: 24000, day: TODAY });
    expect(usualAmount(sofia, COFFEE)).toBe(740);
    expect(usualAmount(sofia, STAYS)).toBeNull();
  });

  it("expresses a balance in the tally's own categories", async () => {
    const { sofia } = await pair();
    for (let i = 0; i < 5; i++) await addPayment(sofia, { category: DRINKS, amount: 2000, day: TODAY });
    await addPayment(sofia, { category: COFFEE, amount: 400, day: TODAY });
    expect(socialUnits(sofia, 4000)).toEqual({ category: DRINKS, units: 2 });
  });
});

describe("integrity", () => {
  it("notices when a received history doesn't match its summary", async () => {
    const { sofia, liam, key } = await pair();
    await addPayment(sofia, { category: COFFEE, amount: 500, day: TODAY });
    await open(await send(sofia, key), key, liam);
    expect(await verify(liam)).toEqual([]);
    Object.values(liam.entries)[0].v = 50_000;   // tampered or corrupted copy
    expect(await verify(liam)).toEqual([sofia.me.writer]);
  });
});
