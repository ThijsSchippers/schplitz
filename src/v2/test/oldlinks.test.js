// @vitest-environment node
// Old Schplitz 1 links opened in Schplitz 2 (migration doc, step 5). Fixtures are made by the real v1 code.
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { encrypt, encryptCompressed, compressToUrl } from "../../utils.js";
import { openCache } from "../cache.js";
import { readOldLink, tallyForOldLink, openOldLink, readLinkFile, convertDeviceV1, prepareShare, openLink } from "../app.js";
import { logOf, balance } from "../tally.js";

const Q = "Where did we meet?";
const rateFor = async () => ({ rate: 1, estimated: false });
let clock = Date.UTC(2026, 2, 1);
const exp = (paidBy, amount) => ({ id: `${(clock += 60_000).toString(36)}-abcdefgh`, description: "x", amount, currency: "EUR", paidBy, date: "2026-03-14" });
const mini = (list) => list.map(e => ({ i: e.id, d: e.description, a: e.amount, c: e.currency, p: e.paidBy, t: e.date }));

async function v4Link(expenses, names = ["Sofia", "Liam"]) {
  const payload = { v: 4, question: Q, names, encrypted: await encryptCompressed(JSON.stringify({ expenses: mini(expenses), status: "done" }), "lisbon") };
  return `https://schplitz.com/#share=${await compressToUrl(JSON.stringify(payload))}`;
}
const v3Text = async (expenses) =>
  JSON.stringify({ v: 3, question: Q, names: ["Sofia", "Liam"], encrypted: await encrypt(JSON.stringify({ expenses: mini(expenses) }), "lisbon") });
const phone = () => openCache(`old-${crypto.randomUUID()}`);
const storage = (data) => ({ getItem: () => data, setItem: () => {} });
const legacyLog = (t, name) => logOf(t, Object.keys(t.writers).find(w => t.writers[w].legacy && t.members.find(m => m.id === t.writers[w].member).name === name));

describe("old Schplitz 1 links in Schplitz 2", () => {
  const e1 = [exp("Sofia", 10), exp("Liam", 24)];
  const e2 = [...e1, exp("Sofia", 30)];

  it("on a phone without the tally: asks which name is yours, then creates it", async () => {
    const cache = await phone();
    const share = await readOldLink(await v4Link(e1));
    expect(share).toMatchObject({ question: Q, names: ["Sofia", "Liam"] });
    expect(await tallyForOldLink(cache, share)).toBeNull();
    await expect(openOldLink(cache, share, { answer: "Lisbon", rateFor })).rejects.toMatchObject({ code: "invalid-input" });
    const r = await openOldLink(cache, share, { answer: "Lisbon", myName: "Liam", rateFor });
    expect(r.outcome).toBe("created");
    expect(balance(r.tally)[r.tally.me.member]).toBe(700);   // Liam paid 24, Sofia 10
    expect(await cache.loadKey(r.tally.id)).not.toBeNull();
    expect((await tallyForOldLink(cache, share)).id).toBe(r.tally.id);
  });

  it("refuses a wrong answer", async () => {
    const share = await readOldLink(await v4Link(e1));
    await expect(openOldLink(await phone(), share, { answer: "porto", myName: "Liam", rateFor })).rejects.toMatchObject({ code: "cannot-decrypt" });
  });

  it("updates the other person's old entries from a newer link, and ignores an older one", async () => {
    const cache = await phone();
    await openOldLink(cache, await readOldLink(await v4Link(e1)), { answer: "lisbon", myName: "Liam", rateFor });
    const newer = await openOldLink(cache, await readOldLink(await v4Link(e2)), { answer: "lisbon", rateFor });
    expect(newer.outcome).toBe("updated");
    expect(legacyLog(newer.tally, "Sofia")).toHaveLength(2);
    expect(legacyLog(await cache.loadTally(newer.tally.id), "Sofia")).toHaveLength(2);   // saved
    const older = await openOldLink(cache, await readOldLink(await v4Link(e1)), { answer: "lisbon", rateFor });
    expect(older.outcome).toBe("older");
  });

  it("changes nothing once the other person's own version has arrived", async () => {
    const sofiaPhone = await phone(), liamPhone = await phone();
    const raw = (me, other) => JSON.stringify({ initialized: true, myName: me, otherName: other, securityQuestion: Q, expenses: e2 });
    const sofia = await convertDeviceV1(sofiaPhone, { storage: storage(raw("Sofia", "Liam")), answer: "lisbon", rateFor });
    await convertDeviceV1(liamPhone, { storage: storage(raw("Liam", "Sofia")), answer: "lisbon", rateFor });
    const first = await prepareShare(sofia.tally, sofia.key, { origin: "https://schplitz.com" });
    await openLink(liamPhone, first.url);
    const r = await openOldLink(liamPhone, await readOldLink(await v4Link(e2)), { answer: "lisbon", rateFor });
    expect(r.outcome).toBe("up-to-date");
  });

  it("says so when this phone's tally was brought in with a different answer", async () => {
    const cache = await phone();
    const raw = JSON.stringify({ initialized: true, myName: "Liam", otherName: "Sofia", securityQuestion: Q, expenses: e1 });
    await convertDeviceV1(cache, { storage: storage(raw), answer: "lisboa", rateFor });   // typo when converting
    const share = await readOldLink(await v4Link(e2));
    await expect(openOldLink(cache, share, { answer: "lisbon", rateFor })).rejects.toMatchObject({ code: "answer-mismatch" });
  });

  it("reads old links and v3 text exports from files, and full copies as before", async () => {
    const asFile = (text) => new File([text], "x.txt");
    expect((await readLinkFile(asFile(await v4Link(e1)))).kind).toBe("old");
    expect((await readLinkFile(asFile(await v3Text(e1)))).share.question).toBe(Q);
    await expect(readLinkFile(asFile("hello"))).rejects.toMatchObject({ code: "not-a-link" });
    await expect(readLinkFile(asFile('{"v":9}'))).rejects.toMatchObject({ code: "not-a-link" });
  });
});
