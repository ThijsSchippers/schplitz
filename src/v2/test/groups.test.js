// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createTally, joinTally, mergePayload, addPayment, addMember, renameTally, tallyName, balance, whoseTurn, allEntries } from "../tally.js";
import { deriveKey, encodeLink, decodeLink, readHeader } from "../link.js";
import { checkPayload } from "../schema.js";
import { openCache } from "../cache.js";
import { startTally, prepareFullCopy, fullCopyFile, linkFromFile, backupDue, markBackedUp, openLink, unlockLink, completeJoin, BACKUP_EVERY_ENTRIES, BACKUP_EVERY_MS } from "../app.js";
import { hero, standings } from "../ui/format.js";
import { browserKind } from "../ui/environment.js";
import { qrPath, QR_MAX_LENGTH } from "../ui/qr.js";

const TODAY = 20_400;
const DRINKS = 6, MEALS = 2;
const idOf = (t, name) => t.members.find(m => m.name === name).id;
const send = async (from, key, opts) => (await encodeLink(from, key, { today: TODAY, ...opts })).url;
const receive = async (url, key, to) => mergePayload(to, (await decodeLink(url, key)).payload);

async function crew(names = ["Ana", "Ben", "Cas", "Dee"]) {
  const first = createTally({ question: "Club?", names, me: names[0] });
  const key = await deriveKey("smash", first.id);
  const phones = { [names[0]]: first };
  const url = await send(first, key);
  for (const n of names.slice(1)) {
    const { header, payload } = await decodeLink(url, key);
    phones[n] = joinTally(header, payload, payload.m.find(([, name]) => name === n)[0]).tally;
  }
  return { phones, key };
}

describe("groups", () => {
  it("whose turn among the people present, and standings for everyone", async () => {
    const { phones } = await crew();
    const ana = phones.Ana;
    await addPayment(ana, { category: DRINKS, amount: 2400, at: TODAY });                                  // everyone
    await addPayment(ana, { category: MEALS, amount: 6000, participants: [idOf(ana, "Ana"), idOf(ana, "Ben")], at: TODAY });
    expect(whoseTurn(ana).member).toBe(idOf(ana, "Ben"));
    const tonight = [idOf(ana, "Ana"), idOf(ana, "Cas"), idOf(ana, "Dee")];
    expect(hero(ana, tonight).title).toMatch(/^Next one's on (Cas|Dee)$/);
    const s = standings(ana);
    expect(s[0]).toMatchObject({ name: "Ben" });
    expect(s.at(-1)).toMatchObject({ name: "Ana", isMe: true, text: expect.stringMatching(/ahead$/) });
  });

  it("anyone can name the tally; the latest name wins on every phone", async () => {
    const { phones, key } = await crew();
    expect(tallyName(phones.Ana)).toBeNull();
    await renameTally(phones.Ben, "Padel crew", TODAY);
    await receive(await send(phones.Ben, key), key, phones.Ana);
    expect(tallyName(phones.Ana)).toBe("Padel crew");
    await renameTally(phones.Ana, "Sunday padel", TODAY + 1);
    await receive(await send(phones.Ana, key), key, phones.Ben);
    expect(tallyName(phones.Ben)).toBe("Sunday padel");
    await renameTally(phones.Ben, "", TODAY + 2);
    expect(tallyName(phones.Ben)).toBeNull();
    await expect(renameTally(phones.Ben, "x".repeat(51))).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("someone added on one phone appears on the others and can join", async () => {
    const { phones, key } = await crew(["Ana", "Ben"]);
    const eve = addMember(phones.Ana, "Eve");
    expect(() => addMember(phones.Ana, " eve ")).toThrow(/already/);
    await receive(await send(phones.Ana, key), key, phones.Ben);
    expect(phones.Ben.members.map(m => m.name)).toEqual(["Ana", "Ben", "Eve"]);
    const { header, payload } = await decodeLink(await send(phones.Ben, key), key);
    const { tally: evePhone, returning } = joinTally(header, payload, eve.id);
    expect(returning).toBe(false);
    await addPayment(evePhone, { category: DRINKS, amount: 3000, at: TODAY });
    await receive(await send(evePhone, key), key, phones.Ana);
    expect(balance(phones.Ana)[eve.id]).toBe(2000);
  });

  it("notices when someone writes from a new phone", async () => {
    const { phones, key } = await crew(["Ana", "Ben"]);
    await addPayment(phones.Ben, { category: DRINKS, amount: 1000, at: TODAY });
    await receive(await send(phones.Ben, key), key, phones.Ana);
    const { header, payload } = await decodeLink(await send(phones.Ana, key), key);
    const { tally: bensNewPhone } = joinTally(header, payload, idOf(phones.Ana, "Ben"));
    await addPayment(bensNewPhone, { category: DRINKS, amount: 500, at: TODAY });
    const report = await receive(await send(bensNewPhone, key), key, phones.Ana);
    expect(report.newPhones).toEqual([idOf(phones.Ana, "Ben")]);
  });

  it("validates tally names in links", async () => {
    const { phones, key } = await crew(["Ana", "Ben"]);
    await renameTally(phones.Ana, "Crew", TODAY);
    const { payload } = await decodeLink(await send(phones.Ana, key), key);
    const w = Object.keys(payload.w)[0];
    expect(() => checkPayload({ ...payload, w: { [w]: { ...payload.w[w], tn: ["x".repeat(60), TODAY, 1] } } })).toThrow(/tally name/);
  });
});

describe("full copies and backups", () => {
  it("a full copy carries old history, works as a file, and restores a wiped phone", async () => {
    const cache = await openCache(`g-${crypto.randomUUID()}`);
    const { tally, key } = await startTally(cache, { question: "Where?", answer: "lisbon", myName: "Sofia", friendNames: ["Liam"], name: "Us" });
    for (let i = 0; i < 40; i++) await addPayment(tally, { category: DRINKS, amount: 1000 + i, at: TODAY - 200 + i });
    const normal = await encodeLink(tally, key, { today: TODAY });
    const full = await prepareFullCopy(tally, key, { origin: "https://schplitz.com/v2" });
    expect(normal.entries).toBe(20);
    expect(full.entries).toBe(41);   // 40 payments + the name

    const file = fullCopyFile("Us", full.url);
    expect(file.name).toBe("schplitz-us.schplitz");
    const url = await linkFromFile(file);
    expect(readHeader(url).tallyId).toBe(tally.id);
    await expect(linkFromFile(new File(["not a link"], "x.schplitz"))).rejects.toMatchObject({ code: "not-a-link" });
    await expect(linkFromFile({ size: 50_000_000, text: () => { throw new Error("must not be read"); } })).rejects.toMatchObject({ code: "too-large" });

    const wiped = await openCache(`g-${crypto.randomUUID()}`);
    expect((await openLink(wiped, url)).kind).toBe("join");
    const unlocked = await unlockLink(wiped, url, "Lisbon");
    const { tally: restored, returning } = await completeJoin(wiped, unlocked, tally.me.member);
    expect(returning).toBe(true);
    expect(allEntries(restored)).toHaveLength(41);   // 40 payments + the name
    expect(tallyName(restored)).toBe("Us");
  });

  it("suggests a backup after 20 new entries, or a month after the last one when something changed", async () => {
    const cache = await openCache(`g-${crypto.randomUUID()}`);
    const { tally } = await startTally(cache, { question: "q", answer: "a", myName: "A", friendNames: ["B"] });
    const now = Date.now();
    expect(backupDue(tally, now)).toBe(false);
    for (let i = 0; i < BACKUP_EVERY_ENTRIES - 1; i++) await addPayment(tally, { category: DRINKS, amount: 100 });
    expect(backupDue(tally, now)).toBe(false);
    expect(backupDue(tally, now + BACKUP_EVERY_MS)).toBe(true);
    await addPayment(tally, { category: DRINKS, amount: 100 });
    expect(backupDue(tally, now)).toBe(true);
    await markBackedUp(cache, tally);
    expect(backupDue(tally)).toBe(false);
    expect(backupDue(tally, Date.now() + BACKUP_EVERY_MS)).toBe(false);   // nothing changed since
  });
});

describe("browser hints and QR", () => {
  it("recognises in-app browsers and WebKit browsers", () => {
    const iosInstagram = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0";
    const iosChrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
    const macSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    const macChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    const androidWebView = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36";
    expect(browserKind(iosInstagram)).toEqual({ inApp: "Instagram", appleWebKit: true });
    expect(browserKind(iosChrome)).toEqual({ inApp: null, appleWebKit: true });
    expect(browserKind(macSafari)).toEqual({ inApp: null, appleWebKit: true });
    expect(browserKind(macChrome)).toEqual({ inApp: null, appleWebKit: false });
    expect(browserKind(androidWebView)).toEqual({ inApp: "", appleWebKit: false });
  });

  it("makes QR codes for links that fit, and none for longer ones", () => {
    const small = qrPath("https://schplitz.com/v2/#s=5.abc");
    expect(small.size).toBeGreaterThanOrEqual(29);
    expect(small.path).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(qrPath("x".repeat(QR_MAX_LENGTH + 1))).toBeNull();
  });
});

describe("about even", () => {
  it("is the same €5 rule for a pair, and compares the people present in a group", async () => {
    const pair = createTally({ question: "q", names: ["A", "B"], me: "A" });
    await addPayment(pair, { category: DRINKS, amount: 998 });          // B is €4.99 behind
    expect(whoseTurn(pair).aboutEven).toBe(true);
    await addPayment(pair, { category: DRINKS, amount: 2 });            // €5.00
    expect(whoseTurn(pair).aboutEven).toBe(false);

    const { phones } = await crew(["Ana", "Ben", "Cas"]);
    const ana = phones.Ana;
    await addPayment(ana, { category: MEALS, amount: 6000, participants: [idOf(ana, "Ana"), idOf(ana, "Ben")] });
    // Ben is €30 behind, Cas is even overall but €30 behind Ana tonight.
    const turn = whoseTurn(ana, [idOf(ana, "Ana"), idOf(ana, "Cas")]);
    expect(turn).toMatchObject({ member: idOf(ana, "Cas"), net: 0, aboutEven: false });
  });
});
