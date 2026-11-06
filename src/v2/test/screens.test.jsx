// The React screens, rendered in jsdom with an in-memory IndexedDB.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../ui/App.jsx";
import * as workflows from "../app.js";
import { openCache } from "../cache.js";

const rateFor = async () => ({ rate: 1, estimated: false });

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/v2/");
});

async function startPair(user) {
  const cacheName = `screens-${crypto.randomUUID()}`;
  render(<App cacheName={cacheName} rateFor={rateFor} />);
  await user.click(await screen.findByRole("button", { name: "Start a tally" }));
  await user.type(screen.getByLabelText("Your name"), "Sofia");
  await user.type(screen.getByLabelText("Who's it with?"), "Liam");
  await user.type(screen.getByLabelText("A question only you two can answer"), "Where?");
  await user.type(screen.getByLabelText("Answer"), "Lisbon");
  await user.type(screen.getByLabelText("Answer again"), "lisbon");
  await user.click(screen.getByRole("button", { name: "Start" }));
  const invite = await screen.findByRole("dialog", { name: "Invite Liam" }, { timeout: 5000 });
  await user.click(within(invite).getByRole("button", { name: "Close" }));
  return cacheName;
}

async function logPayment(user, category, keys, add) {
  await user.click(screen.getByRole("button", { name: "I paid" }));
  await user.click(screen.getByRole("button", { name: category }));
  for (const k of keys) await user.click(screen.getByRole("button", { name: k }));
  await user.click(screen.getByRole("button", { name: add }));
  const share = await screen.findByRole("dialog", { name: "Share with Liam" });
  expect(within(share).getByText(/^“Got the/)).toBeInTheDocument();
  await user.click(within(share).getByRole("button", { name: "Later" }));
}

describe("Schplitz 2 screens", () => {
  it("start a tally, log drinks, see whose turn it is", async () => {
    const user = userEvent.setup();
    await startPair(user);
    expect(screen.getByText("You're about even")).toBeInTheDocument();
    await logPayment(user, "Drinks", ["2", "4"], "Add drinks");
    expect(screen.getByText("Next one's on Liam")).toBeInTheDocument();
    expect(screen.getByText("Liam is about a round of drinks behind.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 not shared yet/ })).toBeInTheDocument();
  }, 20_000);

  it("details show exact amounts, and deleting a payment needs confirming", async () => {
    const user = userEvent.setup();
    await startPair(user);
    await logPayment(user, "Meals", ["4", "0"], "Add meal");
    await user.click(screen.getByRole("button", { name: "Details and exact amounts" }));
    expect(screen.getByText("€20.00 behind")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Meals/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = screen.getByRole("dialog", { name: "Are you sure?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No payments yet.")).toBeInTheDocument();
  }, 20_000);

  it("the logging screen works with a hardware keyboard and suggests the usual amount", async () => {
    const user = userEvent.setup();
    await startPair(user);
    await logPayment(user, "Coffee", ["3", "Decimal separator", "5"], "Add coffee");
    await user.click(screen.getByRole("button", { name: "I paid" }));
    await user.click(screen.getByRole("button", { name: "Coffee" }));
    expect(screen.getByText("usual for Coffee · type to change")).toBeInTheDocument();
    for (const key of ["4", ",", "2"]) fireEvent.keyDown(window, { key });
    expect(screen.getByText("€4.2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(screen.getByText("€4.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "I paid" })).toBeInTheDocument();
  }, 20_000);

  it("a sheet takes focus and gives it back", async () => {
    const user = userEvent.setup();
    await startPair(user);
    const shareButton = screen.getByRole("button", { name: /Share with Liam/ });
    shareButton.focus();
    await user.click(shareButton);
    const sheet = await screen.findByRole("dialog");
    expect(sheet.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(shareButton);
  }, 20_000);
});

describe("Schplitz 2 screens: groups", () => {
  it("a group of three: who's here, who was there, standings, and a QR code", async () => {
    const user = userEvent.setup();
    render(<App cacheName={`screens-${crypto.randomUUID()}`} rateFor={rateFor} />);
    await user.click(await screen.findByRole("button", { name: "Start a tally" }));
    await user.type(screen.getByLabelText("Your name"), "Ana");
    await user.type(screen.getByLabelText("Who's it with?"), "Ben");
    await user.click(screen.getByRole("button", { name: "Add someone" }));
    await user.type(screen.getByLabelText("Person 3"), "Cas");
    await user.type(screen.getByLabelText("Name for the group (optional)"), "Padel crew");
    await user.type(screen.getByLabelText("A question only your group can answer"), "Club?");
    await user.type(screen.getByLabelText("Answer"), "smash");
    await user.type(screen.getByLabelText("Answer again"), "smash");
    await user.click(screen.getByRole("button", { name: "Start" }));
    const invite = await screen.findByRole("dialog", { name: /Invite/ }, { timeout: 5000 });
    await user.click(within(invite).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("heading", { name: "Padel crew" })).toBeInTheDocument();

    // Only Ana and Ben had dinner: Ana pays 60, split two ways.
    await user.click(screen.getByRole("button", { name: "I paid" }));
    await user.click(screen.getByRole("button", { name: "Meals" }));
    await user.click(screen.getByRole("button", { name: /Who was there/ }));
    const who = screen.getByRole("dialog", { name: "Who was there?" });
    await user.click(within(who).getByRole("button", { name: "Cas" }));
    await user.click(within(who).getByRole("button", { name: "Done" }));
    for (const k of ["6", "0"]) await user.click(screen.getByRole("button", { name: k }));
    await user.click(screen.getByRole("button", { name: "Add meal" }));
    const share = await screen.findByRole("dialog", { name: "Share with the group" });
    await user.click(await within(share).findByRole("button", { name: "Show QR code" }));
    expect(within(share).getByRole("img", { name: "QR code of the link" })).toBeInTheDocument();
    await user.click(within(share).getByRole("button", { name: "Later" }));

    expect(screen.getByText("Next one's on Ben")).toBeInTheDocument();
    const everyone = screen.getByRole("heading", { name: "Everyone" }).nextElementSibling;
    expect(within(everyone).getAllByRole("listitem").map(li => li.textContent)).toEqual([
      expect.stringMatching(/^Ben/), expect.stringMatching(/^Casabout even$/), expect.stringMatching(/^You.*ahead$/),
    ]);

    // Ben isn't here tonight: it's Cas's turn among Ana and Cas.
    await user.click(screen.getByRole("button", { name: "Ben" }));
    expect(screen.getByText("Next one's on Cas")).toBeInTheDocument();
    expect(screen.getByText("Of the people here, Cas is furthest behind.")).toBeInTheDocument();
  }, 30_000);
});

describe("landing page", () => {
  it("shows newcomers the landing page; Start a tally goes straight to the start screen", async () => {
    const { default: Site } = await import("../ui/Site.jsx");
    sessionStorage.clear();
    const user = userEvent.setup();
    render(<Site cacheName={`screens-${crypto.randomUUID()}`} rateFor={rateFor} />);
    expect(screen.getByRole("heading", { level: 1, name: "Your payment data is yours. And yours alone." })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Start a tally" })[0]);
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
  });

  it("skips the landing page for links, returning visitors and Schplitz 1 users", async () => {
    const { skipLanding } = await import("../ui/Site.jsx");
    const store = (data) => ({ getItem: (k) => data[k] ?? null });
    const none = store({});
    expect(skipLanding({ hash: "", local: none, session: none })).toBe(false);
    expect(skipLanding({ hash: "#s=5.abc", local: none, session: none })).toBe(true);
    expect(skipLanding({ hash: "#share=abc", local: none, session: none })).toBe(true);
    expect(skipLanding({ hash: "", local: store({ schplitz2Used: "1" }), session: none })).toBe(true);
    expect(skipLanding({ hash: "", local: store({ schplitzExpenses: "{}" }), session: none })).toBe(true);
    expect(skipLanding({ hash: "", local: none, session: store({ schplitz2Opened: "1" }) })).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(skipLanding({ hash: "", local: broken, session: broken })).toBe(false);
  });
});


it("finishes a pending payment save without navigating away from home", async () => {
  const user = userEvent.setup();
  const cacheName = await startPair(user);
  const pending = Promise.withResolvers();
  const record = workflows.recordPayment;
  const delayed = vi.spyOn(workflows, "recordPayment").mockImplementation(async (...args) => {
    await pending.promise;
    return record(...args);
  });
  try {
    await user.click(screen.getByRole("button", { name: "I paid" }));
    await user.click(screen.getByRole("button", { name: "Drinks" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: "Add drinks" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Start a tally" })).toBeInTheDocument();
    await act(async () => { pending.resolve(); await delayed.mock.results[0].value; });
    expect(screen.getByRole("button", { name: "Start a tally" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const cache = await openCache(cacheName);
    try {
      const [tally] = await cache.listTallies();
      const entries = Object.values(tally.logs).flatMap(log => Object.values(log));
      expect(entries).toEqual([expect.objectContaining({ t: "pay", a: 2400 })]);
    } finally { cache.close(); }
  } finally { pending.resolve(); delayed.mockRestore(); }
}, 20_000);
