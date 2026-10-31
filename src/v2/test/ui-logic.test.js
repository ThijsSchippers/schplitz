// @vitest-environment node
import { describe, it, expect } from "vitest";
import { pressKey, fitDecimals, textOfMinor, typedOfMinor, minorOfText, displayTyped, decimalSeparator, keyFromKeyboard } from "../ui/numpad.js";
import { money, dayLabel, hero, shareMessage, othersLabel, errorText, payments, socialAmount } from "../ui/format.js";
import { createTally, addPayment, voidPayment } from "../tally.js";
import { SchplitzError } from "../schema.js";

const type = (keys, decimals = 2, start = { text: "", suggested: false }) =>
  keys.reduce((s, k) => pressKey(s, k, decimals), start).text;

describe("numpad", () => {
  it("types like a calculator", () => {
    expect(type(["2", "5"])).toBe("25");
    expect(type(["1", "2", ".", "5"])).toBe("12.5");
    expect(type([".", "5"])).toBe("0.5");
    expect(type(["0", "0", "7"])).toBe("7");
  });

  it("limits decimals and whole digits", () => {
    expect(type(["1", ".", "2", "3", "4"])).toBe("1.23");
    expect(type(["1", ".", "5"], 0)).toBe("15");
    expect(type(Array(9).fill("9"))).toBe("9999999");
    expect(type(["1", ".", "."])).toBe("1.");
  });

  it("replaces a suggested amount on the first digit; backspace clears it", () => {
    const suggested = { text: "7.40", suggested: true };
    expect(type(["5"], 2, suggested)).toBe("5");
    expect(type(["back"], 2, suggested)).toBe("");
    expect(type(["."], 2, suggested)).toBe("0.");
  });

  it("deletes and clears", () => {
    expect(type(["1", "2", "back"])).toBe("1");
    expect(type(["1", "2", "clear"])).toBe("");
  });

  it("converts between typed text and minor units", () => {
    expect(minorOfText("7.4", 2)).toBe(740);
    expect(minorOfText("1.005", 3)).toBe(1005);
    expect(minorOfText("", 2)).toBe(0);
    expect(minorOfText("12.", 2)).toBe(1200);
    expect(textOfMinor(740, 2)).toBe("7.40");
    expect(textOfMinor(900, 0)).toBe("900");
    expect([[2400, 2], [740, 2], [705, 2], [10, 2], [900, 0], [1000, 0]].map(([m, d]) => typedOfMinor(m, d))).toEqual(["24", "7.4", "7.05", "0.1", "900", "1000"]);
    expect(fitDecimals("12.55", 0)).toBe("12");
    expect(fitDecimals("12.555", 2)).toBe("12.55");
  });

  it("shows what was typed in the phone's language", () => {
    expect(displayTyped("1240", "THB", "en").replace(/\s/g, " ")).toBe("THB 1,240");
    expect(displayTyped("12.", "EUR", "en")).toBe("€12.");
    expect(displayTyped("7.4", "EUR", "nl").replace(/\s/g, " ")).toBe("€ 7,4");
    expect(displayTyped("", "EUR", "en")).toBe("€0");
    expect(decimalSeparator("de")).toBe(",");
  });

  it("maps hardware keys", () => {
    expect(["7", ",", ".", "Backspace", "Delete", "a"].map(keyFromKeyboard)).toEqual(["7", ".", ".", "back", "clear", null]);
  });
});

describe("text on screen", () => {
  const pair = () => createTally({ question: "q", names: ["Sofia", "Liam"], me: "Sofia" });

  it("formats money and days", () => {
    expect(money(740, "EUR", "en")).toBe("€7.40");
    expect(money(900, "ALL", "en")).toMatch(/ALL\s900/);
    expect(dayLabel(100, 100, "en")).toBe("Today");
    expect(dayLabel(99, 100, "en")).toBe("Yesterday");
    expect(dayLabel(20_524, 20_527, "en")).toBe(new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" }).format(new Date(20_524 * 86_400_000)));
    expect(dayLabel(20_400, 20_527, "en")).toMatch(/\w+ \d+|\d+ \w+/);
  });

  it("says whose turn it is in social units", async () => {
    const t = pair();
    expect(hero(t).title).toBe("You're about even");
    for (let i = 0; i < 4; i++) await addPayment(t, { category: 6, amount: 2400 });
    expect(hero(t)).toMatchObject({ title: "Next one's on Liam", sub: "Liam is about 2 rounds of drinks behind." });
    expect(socialAmount(t, 2400)).toBe("about a round of drinks");
    expect(shareMessage(t, 6)).toBe("Got the drinks — next one's on you");
    expect(othersLabel(t, "en")).toBe("Liam");
  });

  it("falls back to 'a bit' or 'well' when no category fits", async () => {
    const t = pair();
    await addPayment(t, { category: 0, amount: 1500 });
    expect(hero(t).sub).toBe("Liam is a bit behind.");
    await addPayment(t, { category: 0, amount: 50_000 });
    expect(hero(t).sub).toBe("Liam is well behind.");
  });

  it("lists payments newest first, without deleted ones", async () => {
    const t = pair();
    await addPayment(t, { category: 7, amount: 300, at: 100 });
    const gone = await addPayment(t, { category: 2, amount: 3000, at: 101 });
    await addPayment(t, { category: 6, amount: 1200, paidOn: 99, at: 102 });
    await voidPayment(t, gone.s, 102);
    expect(payments(t).map(p => [p.k, p.day])).toEqual([[7, 100], [6, 99]]);
  });

  it("explains errors in plain words", () => {
    expect(errorText(new SchplitzError("cannot-decrypt", "x"))).toMatch(/answer doesn't match/);
    expect(errorText(new SchplitzError("not-allowed", "Already resolved"))).toBe("Already resolved");
    expect(errorText(new Error("boom"))).toMatch(/Something went wrong/);
  });
});
