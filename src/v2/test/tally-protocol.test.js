// @vitest-environment node
import { describe, it, expect } from "vitest";
import { foldLog, effectivePays } from "../tally.js";
import fixture from "./tally-protocol.fixture.json";

// Captured from the implementation before the module extraction (e314e3e).
// The fixed hash protects link compatibility; deriving it here would hide changes.
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
  }
  return value;
}

describe("tally summary compatibility", () => {
  it("preserves the existing hash and summary without mutating the log", async () => {
    const entries = freeze(structuredClone(fixture.entries));
    expect(await foldLog(fixture.member, entries)).toEqual(fixture.summary);
    expect(entries).toEqual(fixture.entries);
    expect([...effectivePays(entries).keys()]).toEqual([1]);
    expect(effectivePays(entries).get(1)).toMatchObject({ a: 1003, v: 1003 });
  });

  it("hashes reordered object keys identically, including nested unknown fields", async () => {
    expect(await foldLog(fixture.member, reverseKeys(fixture.entries))).toEqual(fixture.summary);
  });

  it("includes unknown entries in the hash without changing known balances", async () => {
    const entries = structuredClone(fixture.entries);
    entries.at(-1).extra.z = 2;
    const summary = await foldLog(fixture.member, entries);
    expect(summary.h).not.toBe(fixture.summary.h);
    expect({ ...summary, h: fixture.summary.h }).toEqual(fixture.summary);
  });

  it("rejects a gap in a complete writer log", async () => {
    const entries = fixture.entries.filter(entry => entry.s !== 3);
    await expect(foldLog(fixture.member, entries)).rejects.toMatchObject({ code: "invalid-payload" });
  });
});
