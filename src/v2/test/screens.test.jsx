// The React screens, rendered in jsdom with an in-memory IndexedDB.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../ui/App.jsx";

const rateFor = async () => ({ rate: 1, estimated: false });

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/v2/");
});

async function startPair(user) {
  render(<App cacheName={`screens-${crypto.randomUUID()}`} rateFor={rateFor} />);
  await user.click(await screen.findByRole("button", { name: "Start a tally" }));
  await user.type(screen.getByLabelText("Your name"), "Sofia");
  await user.type(screen.getByLabelText("Who's it with?"), "Liam");
  await user.type(screen.getByLabelText("A question only you two can answer"), "Where?");
  await user.type(screen.getByLabelText("Answer"), "Lisbon");
  await user.type(screen.getByLabelText("Answer again"), "lisbon");
  await user.click(screen.getByRole("button", { name: "Start" }));
  const invite = await screen.findByRole("dialog", { name: "Invite Liam" }, { timeout: 5000 });
  await user.click(within(invite).getByRole("button", { name: "Close" }));
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
