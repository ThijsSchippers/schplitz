// @vitest-environment node
// Tests for the issues found in the code-quality review: one or more per fix.
import { describe, it, expect, vi } from "vitest";
import {
  createTally, joinTally, mergePayload, addPayment, editPayment, voidPayment, addPaidBack, notMe, askAbout,
  acceptDispute, keepAsIs, openDisputes, balance, whoseTurn, verify, paymentState, paymentDay, entryOf, split,
} from "../tally.js";
import { deriveKey, encodeLink, decodeLink, readHeader, selectWindow } from "../link.js";
import { checkPayload, SchplitzError } from "../schema.js";
import { toMinorUnits, toBase64Url, fromBase64Url, deflate, inflate, localDayNumber, dayOfIsoDate } from "../encoding.js";
import { createRateLookup } from "../migrate.js";

const TODAY = 20_400;
const MEALS = 2, COFFEE = 7;
const idOf = (t, name) => t.members.find(m => m.name === name).id;

async function group(names) {
  const first = createTally({ question: "Club name?", names, me: names[0] });
  const key = await deriveKey("smash", first.id);
  const phones = { [names[0]]: first };
  const url = (await encodeLink(first, key, { today: TODAY })).url;
  for (const n of names.slice(1)) {
    const { header, payload } = await decodeLink(url, key);
    phones[n] = joinTally(header, payload, payload.m.find(([, name]) => name === n)[0]).tally;
  }
  return { phones, key };
}
async function sync(from, to, key, opts = {}) {
  const { payload } = await decodeLink((await encodeLink(from, key, { today: TODAY, ...opts })).url, key);
  return mergePayload(to, payload);
}

describe("money and encoding helpers", () => {
  it("rounds decimal amounts as written, not as binary floats", () => {
    expect(toMinorUnits(1.005, 2)).toBe(101);
    expect(toMinorUnits(10.005, 2)).toBe(1001);
    expect(toMinorUnits(-1.005, 2)).toBe(-101);
    expect(toMinorUnits(0.1 + 0.2, 2)).toBe(30);
    expect(toMinorUnits(900, 0)).toBe(900);
    expect(toMinorUnits(1e-7, 2)).toBe(0);
  });

  it("encodes large binary data without overflowing the stack", () => {
    const huge = new Uint8Array(300_000);
    for (let i = 0; i < huge.length; i += 65_536) crypto.getRandomValues(huge.subarray(i, i + 65_536));
    expect(fromBase64Url(toBase64Url(huge))).toEqual(huge);
  });

  it("stops decompressing past the limit", async () => {
    const bomb = await deflate(new Uint8Array(5_000_000));
    expect(bomb.length).toBeLessThan(10_000);
    await expect(inflate(bomb, 1_000_000)).rejects.toBeInstanceOf(RangeError);
    expect((await inflate(bomb, 5_000_000)).length).toBe(5_000_000);
  });

  it("uses the phone's own calendar day, not the UTC day", () => {
    expect(localDayNumber(new Date(2026, 2, 14, 0, 30))).toBe(dayOfIsoDate("2026-03-14"));
    expect(localDayNumber(new Date(2026, 2, 14, 23, 30))).toBe(dayOfIsoDate("2026-03-14"));
  });
});

describe("payment dates", () => {
  it("editing a payment keeps its date", async () => {
    const { phones } = await group(["Sofia", "Liam"]);
    const pay = await addPayment(phones.Sofia, { category: MEALS, amount: 4000, at: TODAY - 10 });
    await editPayment(phones.Sofia, pay.s, { a: 4500 }, TODAY);
    const now = paymentState(phones.Sofia, pay.w, pay.s);
    expect(paymentDay(now)).toBe(TODAY - 10);
    expect(now.v).toBe(4500);
  });

  it("a backdated payment logged today still travels in links", async () => {
    const { phones } = await group(["Sofia", "Liam"]);
    for (let i = 0; i < 25; i++) await addPayment(phones.Sofia, { category: COFFEE, amount: 300, at: TODAY - 100 + i });
    const late = await addPayment(phones.Sofia, { category: MEALS, amount: 9000, paidOn: TODAY - 60, at: TODAY });
    expect(paymentDay(late)).toBe(TODAY - 60);
    expect(selectWindow(phones.Sofia, TODAY).entries).toContainEqual(late);
  });
});

describe("disputes stay consistent with the payer's changes", () => {
  async function dinner() {
    const { phones, key } = await group(["Jessy", "Sofia", "Liam", "Noor"]);
    const pay = await addPayment(phones.Jessy, { category: MEALS, amount: 10_000, at: TODAY });
    for (const n of ["Sofia", "Liam", "Noor"]) await sync(phones.Jessy, phones[n], key);
    const d = await notMe(phones.Sofia, [pay.w, pay.s], TODAY);
    await sync(phones.Sofia, phones.Jessy, key);
    return { phones, key, pay, d };
  }

  it("deleting a payment with an open 'Not me' leaves nothing behind", async () => {
    const { phones, key, pay } = await dinner();
    await voidPayment(phones.Jessy, pay.s, TODAY);
    expect(Object.values(balance(phones.Jessy)).every(v => v === 0)).toBe(true);
    expect(openDisputes(phones.Jessy)).toHaveLength(0);
    await sync(phones.Jessy, phones.Liam, key);
    expect(Object.values(balance(phones.Liam)).every(v => v === 0)).toBe(true);
  });

  it("taking someone out by editing doesn't count them out twice", async () => {
    const { phones, pay } = await dinner();
    const without = [idOf(phones.Jessy, "Jessy"), idOf(phones.Jessy, "Liam"), idOf(phones.Jessy, "Noor")];
    await editPayment(phones.Jessy, pay.s, { p: without }, TODAY);
    expect(openDisputes(phones.Jessy)).toHaveLength(0);
    // Exactly a three-way split, with Sofia out once (not twice).
    const shares = split(10_000, without);
    expect(balance(phones.Jessy)).toEqual({
      [idOf(phones.Jessy, "Jessy")]: 10_000 - shares[without[0]],
      [idOf(phones.Jessy, "Sofia")]: 0,
      [idOf(phones.Jessy, "Liam")]: -shares[without[1]],
      [idOf(phones.Jessy, "Noor")]: -shares[without[2]],
    });
  });

  it("accepting 'Not me' from the only other participant deletes the payment", async () => {
    const { phones, key } = await group(["Jessy", "Sofia"]);
    const pay = await addPayment(phones.Jessy, { category: MEALS, amount: 2000, participants: [idOf(phones.Jessy, "Sofia")], at: TODAY });
    await sync(phones.Jessy, phones.Sofia, key);
    const d = await notMe(phones.Sofia, [pay.w, pay.s], TODAY);
    await sync(phones.Sofia, phones.Jessy, key);
    await acceptDispute(phones.Jessy, [d.w, d.s], {}, TODAY);
    expect(paymentState(phones.Jessy, pay.w, pay.s)).toBeNull();
    expect(Object.values(balance(phones.Jessy)).every(v => v === 0)).toBe(true);
  });

  it("a dispute can only be resolved once, and only by the payer", async () => {
    const { phones, key, d } = await dinner();
    await sync(phones.Sofia, phones.Liam, key);
    await expect(keepAsIs(phones.Liam, [d.w, d.s])).rejects.toMatchObject({ code: "not-allowed" });
    await keepAsIs(phones.Jessy, [d.w, d.s], TODAY);
    await expect(keepAsIs(phones.Jessy, [d.w, d.s])).rejects.toThrow(/already answered/);
  });

  it("you can't 'ask about' your own payment", async () => {
    const { phones, pay } = await dinner();
    await expect(askAbout(phones.Jessy, [pay.w, pay.s], "amount")).rejects.toMatchObject({ code: "not-allowed" });
  });
});

describe("writes", () => {
  it("rapid taps get distinct sequence numbers and a valid chain", async () => {
    const { phones } = await group(["Sofia", "Liam"]);
    const added = await Promise.all(Array.from({ length: 8 }, () => addPayment(phones.Sofia, { category: COFFEE, amount: 300, at: TODAY })));
    expect(added.map(e => e.s)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await verify(phones.Sofia)).toEqual([]);
  });

  it("a failed write doesn't block the next one", async () => {
    const { phones } = await group(["Sofia", "Liam"]);
    await expect(addPayment(phones.Sofia, { category: COFFEE, amount: -1 })).rejects.toThrow();
    await expect(addPayment(phones.Sofia, { category: COFFEE, amount: 300, at: TODAY })).resolves.toMatchObject({ s: 1 });
  });

  it("rejects invalid input with a stable code", async () => {
    const { phones } = await group(["Sofia", "Liam", "Noor"]);
    const s = phones.Sofia, sofia = idOf(s, "Sofia");
    const cases = [
      addPayment(s, { category: 99, amount: 100 }),
      addPayment(s, { category: COFFEE, amount: 0 }),
      addPayment(s, { category: COFFEE, amount: 1.5 }),
      addPayment(s, { category: COFFEE, amount: 100, participants: [sofia, sofia] }),
      addPayment(s, { category: COFFEE, amount: 100, participants: ["deadbeef"] }),
      addPayment(s, { category: COFFEE, amount: 100, participants: [] }),
      addPaidBack(s, { from: sofia, to: idOf(s, "Liam"), value: 0 }),
      addPaidBack(s, { from: sofia, to: sofia, value: 100 }),
    ];
    for (const c of cases) await expect(c).rejects.toMatchObject({ code: "invalid-input" });
    const pay = await addPayment(s, { category: COFFEE, amount: 100, at: TODAY });
    await expect(editPayment(s, pay.s, { p: [] })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(editPayment(s, pay.s, { c: "USD" })).rejects.toThrow(/foreign amount/);
    expect(await editPayment(s, pay.s, { a: 100 })).toBeNull();   // nothing changed
    expect(() => whoseTurn(s, [])).toThrow(SchplitzError);
    await expect(addPayment(s, { category: "7", amount: 100 })).rejects.toMatchObject({ code: "invalid-input" });
    expect(() => createTally({ question: "", names: ["A", "B"], me: "A" })).toThrow(/question/);
    expect(createTally({ question: "q", names: [" Ana ", "Ben"], me: "Ana " }).members.map(m => m.name)).toEqual(["Ana", "Ben"]);
    expect(() => createTally({ question: "q", names: ["A", "x".repeat(51)], me: "A" })).toThrow(/Names/);
  });
});

describe("untrusted link content", () => {
  async function validPayload() {
    const { phones, key } = await group(["Sofia", "Liam"]);
    await addPayment(phones.Sofia, { category: COFFEE, amount: 640, at: TODAY });
    const { payload } = await decodeLink((await encodeLink(phones.Sofia, key, { today: TODAY })).url, key);
    return { phones, payload };
  }
  const tamper = (payload, f) => { const p = structuredClone(payload); f(p); return p; };

  it("accepts what the app itself produces", async () => {
    const { payload } = await validPayload();
    expect(() => checkPayload(payload)).not.toThrow();
  });

  it("rejects malformed or hostile payloads without touching the tally", async () => {
    const { phones, payload } = await validPayload();
    const w = Object.keys(payload.w)[0];
    const hostile = [
      tamper(payload, p => { p.w = JSON.parse(`{"__proto__": ${JSON.stringify(p.w[w])}}`); }),
      tamper(payload, p => { p.w[w].n = { ...p.w[w].n, cafebabe: 5 }; }),
      tamper(payload, p => { p.w[w].n[Object.keys(p.w[w].n)[0]] = 1e300; }),
      tamper(payload, p => { p.e[0].p = ["cafebabe"]; }),
      tamper(payload, p => { p.e[0].v = -5; }),
      tamper(payload, p => { p.e[0].s = 99; }),
      tamper(payload, p => { p.e = "nope"; }),
      tamper(payload, p => { p.m = Array.from({ length: 11 }, (_, i) => [`0000000${i.toString(16)}`.slice(-8), `P${i}`]); }),
      tamper(payload, p => { p.m[0][1] = "x".repeat(500); }),
      tamper(payload, p => { p.e[0].t = "<script>"; }),
    ];
    const before = JSON.stringify(phones.Liam);
    for (const p of hostile) expect(() => mergePayload(phones.Liam, p)).toThrow(SchplitzError);
    expect(JSON.stringify(phones.Liam)).toBe(before);
    expect({}.m).toBeUndefined();   // nothing leaked into Object.prototype
  });

  it("doesn't let a link move a writer to another member", async () => {
    const { phones, payload } = await validPayload();
    mergePayload(phones.Liam, payload);
    const w = Object.keys(payload.w)[0];
    const moved = tamper(payload, p => { p.w[w].m = p.m.find(([id]) => id !== p.w[w].m)[0]; p.w[w].s += 5; });
    const report = mergePayload(phones.Liam, moved);
    expect(report.conflicts).toEqual([{ writer: w, reason: "writer claimed by another member" }]);
    expect(phones.Liam.writers[w].member).toBe(payload.w[w].m);
  });

  it("keeps entry types from a newer app version and ignores them", async () => {
    const { phones, payload } = await validPayload();
    const w = Object.keys(payload.w)[0];
    const p = tamper(payload, x => { x.w[w].s += 1; x.e.push({ w, s: x.w[w].s, d: TODAY, t: "future", z: 1 }); });
    const report = mergePayload(phones.Liam, p);
    expect(report.newEntries.map(e => e.t)).toContain("future");
    expect(balance(phones.Liam)[idOf(phones.Liam, "Liam")]).toBe(-320);
  });

  it("gives decoding errors a code the app can show", async () => {
    const { phones, key } = await group(["Sofia", "Liam"]);
    const url = (await encodeLink(phones.Sofia, key, { today: TODAY })).url;
    expect(() => readHeader("https://schplitz.com/")).toThrow(expect.objectContaining({ code: "not-a-link" }));
    expect(() => readHeader(url.replace("#s=5.", "#s=6."))).toThrow(expect.objectContaining({ code: "unsupported-version" }));
    await expect(decodeLink(url, await deriveKey("wrong", phones.Sofia.id))).rejects.toMatchObject({ code: "cannot-decrypt" });
    await expect(decodeLink(url.slice(0, -20), key)).rejects.toMatchObject({ code: "cannot-decrypt" });
  });

  it("notices forged category totals too, not only balances", async () => {
    const { phones, key } = await group(["Sofia", "Liam"]);
    await addPayment(phones.Sofia, { category: COFFEE, amount: 500, at: TODAY });
    await sync(phones.Sofia, phones.Liam, key);
    phones.Liam.writers[phones.Sofia.me.writer].summary.c = { 7: [9, 99_999] };
    expect(await verify(phones.Liam)).toEqual([phones.Sofia.me.writer]);
  });
});

describe("link budget", () => {
  it("says when even the smallest link is over budget, and keeps open disputes", async () => {
    const { phones, key } = await group(["Jessy", "Sofia"]);
    const pay = await addPayment(phones.Jessy, { category: MEALS, amount: 5000, at: TODAY - 200 });
    for (let i = 0; i < 30; i++) await addPayment(phones.Jessy, { category: COFFEE, amount: 300, at: TODAY - i });
    await sync(phones.Jessy, phones.Sofia, key, { full: true });
    await notMe(phones.Sofia, [pay.w, pay.s], TODAY);
    const r = await encodeLink(phones.Sofia, key, { today: TODAY, budget: 200 });
    expect(r.fitsBudget).toBe(false);
    const { payload } = await decodeLink(r.url, key);
    expect(payload.e.some(e => e.t === "notme")).toBe(true);
    expect(payload.e.some(e => e.w === pay.w && e.s === pay.s)).toBe(true);
    expect(entryOf(phones.Sofia, pay.w, pay.s)).not.toBeNull();
  });
});

describe("exchange rates", () => {
  const ok = (rate) => ({ ok: true, json: async () => ({ rates: { USD: rate } }) });

  it("asks once per date and currency", async () => {
    const fetchFn = vi.fn(async () => ok(1.1));
    const rateFor = createRateLookup({ fetchFn });
    const [a, b] = await Promise.all([rateFor("2026-03-14", "USD"), rateFor("2026-03-14", "USD")]);
    expect(a).toEqual({ rate: 1.1, estimated: false });
    expect(b).toEqual(a);
    await rateFor("2026-03-15", "USD");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await rateFor("2026-03-14", "EUR")).toEqual({ rate: 1, estimated: false });
  });

  it("falls back to an estimated rate on errors", async () => {
    for (const fetchFn of [async () => { throw new Error("offline"); }, async () => ({ ok: false, status: 500 }), async () => ok(undefined)]) {
      expect(await createRateLookup({ fetchFn })("2026-03-14", "USD")).toEqual({ rate: 1.04, estimated: true });
    }
  });
});
