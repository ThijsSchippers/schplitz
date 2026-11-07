import { describe, expect, it } from "vitest";
import { initialNavigation, navigationReducer as reduce } from "../ui/navigation.js";

const tally = { id: "one", members: [{ id: "a" }, { id: "b" }] };
const open = () => reduce(initialNavigation, { type: "openTally", tally, key: "key", sheet: { kind: "share" } });

describe("navigation", () => {
  it("clears the previous tally and sheet when opening a join or old link", () => {
    for (const action of [{ type: "join", url: "link", header: {} }, { type: "oldLink", share: {}, needsName: true }]) {
      const state = reduce(open(), action);
      expect(state.current).toBeNull();
      expect(state.sheet).toBeNull();
      expect(state.present).toEqual([]);
      expect(state.view.name).toBe(action.type);
    }
  });

  it("ignores a late reload for a tally the user has left", () => {
    const state = reduce(open(), { type: "openTally", tally: { ...tally, id: "two" }, key: "other" });
    expect(reduce(state, { type: "reload", id: "one", tally, key: "key" })).toBe(state);
    expect(reduce(state, { type: "reload", id: "two", tally: null, key: null }).view.name).toBe("home");
  });

  it("preserves the open screen and present members on a matching tab update", () => {
    let state = reduce(open(), { type: "present", members: ["a"] });
    state = reduce(state, { type: "view", view: { name: "details" } });
    const updated = { ...tally, name: "Updated" };
    const result = reduce(state, { type: "reload", id: "one", tally: updated, key: "key" });
    expect(result.current.tally).toBe(updated);
    expect(result.view.name).toBe("details");
    expect(result.present).toEqual(["a"]);
  });

  it("returns edits to details and new payments to the tally with the right share request", () => {
    for (const editing of [false, true]) {
      let state = reduce(open(), { type: "view", view: { name: "log", ...(editing ? { edit: {} } : {}) } });
      expect(reduce(state, { type: "cancelPayment" }).view.name).toBe(editing ? "details" : "tally");
      state = reduce(state, { type: "paymentSaved", id: tally.id, fromView: state.view, editing, category: 7 });
      expect(state.view.name).toBe(editing ? "details" : "tally");
      expect(state.sheet).toEqual({ kind: "share", request: editing ? {} : { lastCategory: 7 } });
    }
  });
});


it("ignores payment completion after leaving or reopening the payment screen", () => {
  const editing = reduce(open(), { type: "view", view: { name: "log" } });
  const saved = { type: "paymentSaved", id: tally.id, fromView: editing.view, editing: false, category: 7 };
  const home = reduce(editing, { type: "home" });
  expect(reduce(home, saved)).toBe(home);
  const other = reduce(editing, { type: "openTally", tally: { ...tally, id: "two" }, key: "other" });
  expect(reduce(other, saved)).toBe(other);
  const reopened = reduce(reduce(editing, { type: "cancelPayment" }), { type: "view", view: { name: "log" } });
  expect(reduce(reopened, saved)).toBe(reopened);
});
