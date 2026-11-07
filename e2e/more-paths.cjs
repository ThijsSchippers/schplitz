// Browser walkthrough of the Schplitz 2 preview with separate browser profiles as separate phones.
// Run against a production build:
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node e2e/more-paths.cjs
// Install Chromium with npm run e2e:install; npm run e2e manages builds and servers.
// Env: BASE (default http://localhost:4173/v2/), SHOTS (screenshot folder, default: none).
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:4173/v2/";
(async () => {
  const browser = await chromium.launch();
  const all = [];
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.addInitScript(() => sessionStorage.setItem("schplitz2Opened", "1"));   // these walkthroughs test the app, not the landing page
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    all.push(errors); return page;
  };
  const link = async (p) => { await p.getByRole("button", { name: "Copy link" }).click(); const u = await p.getByRole("textbox", { name: "Link" }).inputValue(); await p.getByRole("button", { name: "Close" }).click(); return u; };
  const pay = async (p, cat, keys, label) => {
    await p.getByRole("button", { name: "I paid" }).click();
    await p.getByRole("button", { name: cat }).click();
    for (const k of keys) await p.getByRole("button", { name: k, exact: true }).click();
    await p.getByRole("button", { name: label }).click();
    await p.getByRole("dialog").waitFor();
  };
  const hero = (p) => p.locator("main section p").first().textContent();

  // Setup a pair
  const a = await mk(), b = await mk();
  await a.goto(BASE);
  await a.getByRole("button", { name: "Start a tally" }).click();
  await a.getByLabel("Your name").fill("Jessy"); await a.getByLabel("Who's it with?").fill("Sofia");
  await a.getByLabel("A question only you two can answer").fill("Team name?");
  await a.getByLabel("Answer", { exact: true }).fill("smash"); await a.getByLabel("Answer again").fill("smash");
  await a.getByRole("button", { name: "Start", exact: true }).click(); await a.getByRole("dialog").waitFor();
  const inv = await link(a);
  await b.goto(inv); await b.getByLabel("Your answer").fill("smash"); await b.getByRole("button", { name: "Open", exact: true }).click();
  await b.getByRole("button", { name: "Sofia" }).click(); await b.getByText("You're about even").waitFor();

  // 1. Not me straight from the review sheet → share sheet follows
  await pay(a, "Meals", ["1", "0", "0"], "Add meal");
  await b.goto(await link(a)); await b.getByText("New from Jessy").waitFor();
  await b.getByRole("button", { name: "Not me" }).click();
  await b.getByText("All checked.").waitFor();
  await b.getByRole("button", { name: "Done" }).click();
  await b.getByText("I've got a question about one of the payments.").waitFor();
  const notMeLink = await link(b);
  await a.goto(notMeLink);
  await a.getByText("has a question about one of your payments").waitFor();
  console.log("1. review Not me → share sheet → Jessy sees the question: ok; Sofia sees:", (await hero(b)).trim());

  // 2. Jessy changes the amount of a payment and deletes another
  await pay(a, "Drinks", ["2", "4"], "Add drinks"); await a.getByRole("button", { name: "Later" }).click();
  await a.getByRole("button", { name: "Details and exact amounts" }).click();
  await a.getByRole("button", { name: /^Drinks/ }).click();
  await a.getByRole("button", { name: "Change" }).click();
  await a.getByText("Change payment").waitFor();
  for (const k of ["Delete", "Delete", "3", "0"]) await a.getByRole("button", { name: k, exact: true }).click();
  await a.getByRole("button", { name: "Save changes" }).click(); await a.getByRole("dialog").waitFor(); await a.getByRole("button", { name: "Later" }).click();
  const drinks = await a.getByRole("button", { name: /^Drinks/ }).textContent();
  await a.getByRole("button", { name: /^Drinks/ }).click();
  await a.getByRole("button", { name: "Delete", exact: true }).click();
  await a.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await a.getByRole("button", { name: "Later" }).click();
  const remaining = await a.getByRole("listitem").count();
  console.log("2. edited drinks row:", drinks.replace(/\s+/g, " ").trim(), "| rows after delete:", remaining);

  // 3. Sofia's phone is wiped: a new browser opens Jessy's latest link
  await a.getByRole("button", { name: "Back", exact: true }).click();
  await pay(a, "Coffee", ["8"], "Add coffee");
  const latest = await link(a);
  const wiped = await mk();
  await wiped.goto(latest); await wiped.getByLabel("Your answer").fill("smash");
  await wiped.getByRole("button", { name: "Open", exact: true }).click();
  await wiped.getByRole("button", { name: "Sofia" }).click();
  await wiped.getByText("Welcome back").waitFor();
  console.log("3. wiped phone restored:", (await hero(wiped)).trim(), "| Jessy shows:", (await hero(a)).trim());

  // 4. Two phones with Schplitz 1 data meet in v2
  const v1 = (me, other, ex) => JSON.stringify({ initialized: true, myName: me, otherName: other, securityQuestion: "First concert?", statuses: {}, settlements: {}, expenses: ex });
  const ex = [
    { id: "lz0abc12-xyz1", description: "koffie", amount: 3.4, currency: "EUR", paidBy: "Thijs", date: "2026-03-14" },
    { id: "lz0abc14-xyz3", description: "Padel", amount: 32, currency: "EUR", paidBy: "Noor", date: "2026-03-17" },
  ];
  const t = await mk(), n = await mk();
  for (const [p, me, other, extra] of [[t, "Thijs", "Noor", [{ id: "lz0abc20-new1", description: "late beer", amount: 6, currency: "EUR", paidBy: "Thijs", date: "2026-03-20" }]], [n, "Noor", "Thijs", []]]) {
    await p.goto(BASE.replace("/v2/", "/"));
    await p.evaluate(s => localStorage.setItem("schplitzExpenses", s), v1(me, other, [...ex, ...extra]));
    await p.goto(BASE); await p.getByRole("button", { name: "Bring it in" }).click();
    await p.getByLabel("Answer", { exact: true }).fill("Radiohead"); await p.getByLabel("Answer again").fill("radiohead");
    await p.getByRole("button", { name: "Bring it in" }).click(); await p.getByText("came along").waitFor();
    await p.getByRole("button", { name: "No, keep the balance" }).click();
  }
  await t.getByRole("button", { name: /Share with Noor/ }).click(); await t.getByRole("dialog").waitFor();
  await t.getByText("includes your old history").waitFor();
  const first = await link(t);
  await n.goto(first);
  await n.getByRole("dialog").waitFor();
  const reviewText = (await n.getByRole("dialog").textContent()).replace(/\s+/g, " ");
  await n.getByRole("button", { name: "Done" }).click();
  console.log("4. v1 handshake on Noor:", reviewText.slice(0, 160), "| Noor:", (await hero(n)).trim(), "| Thijs:", (await hero(t)).trim());

  console.log("console errors:", all.flat().length ? all.flat() : "none");
  await browser.close();
  if (all.flat().length) throw new Error("Browser console errors occurred");
})().catch(e => { console.error("FAILED:", e.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
