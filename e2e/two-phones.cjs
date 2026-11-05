// Browser walkthrough of the Schplitz 2 preview with separate browser profiles as separate phones.
// Run against a production build:
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node e2e/two-phones.cjs
// Install Chromium with npm run e2e:install; npm run e2e manages builds and servers.
// Env: BASE (default http://localhost:4173/v2/), SHOTS (screenshot folder, default: none).
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:4173/v2/";
const shots = [];
(async () => {
  const browser = await chromium.launch();
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.addInitScript(() => sessionStorage.setItem("schplitz2Opened", "1"));   // these walkthroughs test the app, not the landing page
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    return { page, errors };
  };
  const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); shots.push(name); };
  const linkFromSheet = async (page) => {
    await page.getByRole("button", { name: "Copy link" }).click();
    return page.getByRole("textbox", { name: "Link" }).inputValue();
  };

  const sofia = await mk(), liam = await mk();
  // Sofia starts a tally
  await sofia.page.goto(BASE);
  await shot(sofia.page, "01-home-empty");
  await sofia.page.getByRole("button", { name: "Start a tally" }).click();
  await sofia.page.getByLabel("Your name").fill("Sofia");
  await sofia.page.getByLabel("Who's it with?").fill("Liam");
  await sofia.page.getByLabel("A question only you two can answer").fill("Where did we first meet?");
  await sofia.page.getByLabel("Answer", { exact: true }).fill("Lisbon");
  await sofia.page.getByLabel("Answer again").fill("lisbon");
  await sofia.page.getByRole("button", { name: "Start", exact: true }).click();
  await sofia.page.getByRole("dialog").waitFor();
  await shot(sofia.page, "02-invite-sheet");
  const invite = await linkFromSheet(sofia.page);
  console.log("invite link length", invite.length);
  await sofia.page.getByRole("button", { name: "Close" }).click();

  // Liam opens the invite
  await liam.page.goto(invite);
  await liam.page.getByText("Where did we first meet?").waitFor();
  await liam.page.getByLabel("Your answer").fill("LISBON ");
  await shot(liam.page, "03-join");
  await liam.page.getByRole("button", { name: "Open", exact: true }).click();
  await liam.page.getByRole("button", { name: "Liam" }).click();
  await liam.page.getByText("You're about even").waitFor();

  // Sofia logs a coffee for 7.40
  await sofia.page.getByRole("button", { name: "I paid" }).click();
  await sofia.page.getByRole("button", { name: "Coffee" }).click();
  for (const k of ["7", "Decimal separator", "4"]) await sofia.page.getByRole("button", { name: k, exact: true }).click();
  await shot(sofia.page, "04-logging");
  await sofia.page.getByRole("button", { name: "Add coffee" }).click();
  await sofia.page.getByRole("dialog").waitFor();
  const afterCoffee = await linkFromSheet(sofia.page);
  await sofia.page.getByRole("button", { name: "Close" }).click();
  await shot(sofia.page, "05-sofia-tally");

  // Liam receives it (hash change on an open page)
  await liam.page.goto(afterCoffee);
  await liam.page.getByText("New from Sofia").waitFor();
  await shot(liam.page, "06-liam-review");
  await liam.page.getByRole("button", { name: "Looks right" }).click();
  await liam.page.getByRole("button", { name: "Done" }).click();
  await liam.page.getByText("You're about even").waitFor();   // €3.70 behind is under the €5 threshold

  // Sofia logs a 100 dinner; Liam says Not me
  await sofia.page.getByRole("button", { name: "I paid" }).click();
  await sofia.page.getByRole("button", { name: "Meals" }).click();
  for (const k of ["1", "0", "0"]) await sofia.page.getByRole("button", { name: k, exact: true }).click();
  await sofia.page.getByRole("button", { name: "Add meal" }).click();
  const afterDinner = await linkFromSheet(sofia.page);
  await sofia.page.getByRole("button", { name: "Close" }).click();
  await liam.page.goto(afterDinner);
  await liam.page.getByText("New from Sofia").waitFor();
  await liam.page.getByRole("button", { name: "Done" }).click();
  await liam.page.getByText("Next one's on you").waitFor();
  await shot(liam.page, "07-liam-tally");
  await liam.page.getByRole("button", { name: "Details and exact amounts" }).click();
  await liam.page.getByRole("button", { name: /Meals/ }).click();
  await liam.page.getByRole("button", { name: "Not me" }).click();
  await liam.page.getByRole("dialog").waitFor();
  const fromLiam = await linkFromSheet(liam.page);
  await liam.page.getByRole("button", { name: "Close" }).click();
  await shot(liam.page, "07b-liam-details");
  // Sofia gets the question and takes Liam out
  await sofia.page.goto(fromLiam);
  await sofia.page.getByText("has a question about one of your payments").waitFor();
  await shot(sofia.page, "08-sofia-question");
  await sofia.page.getByRole("button", { name: /question about one of your payments/ }).click();
  await shot(sofia.page, "09-details");
  await sofia.page.getByRole("button", { name: "Take Liam out" }).click();
  await sofia.page.getByRole("dialog").waitFor();
  await sofia.page.getByRole("button", { name: "Later" }).click();
  const heroText = await sofia.page.getByRole("button", { name: "Back" }).click().then(() => sofia.page.locator("main section p").first().textContent());
  console.log("Sofia after taking Liam out:", heroText);

  // Reload: the cache brings everything back
  await sofia.page.reload();
  await sofia.page.getByRole("button", { name: /Liam/ }).first().waitFor();
  await shot(sofia.page, "10-home-after-reload");

  // A phone with Schplitz 1 data
  const old = await mk();
  await old.page.goto(BASE.replace("/v2/", "/"));
  await old.page.evaluate(() => localStorage.setItem("schplitzExpenses", JSON.stringify({
    initialized: true, myName: "Thijs", otherName: "Noor", securityQuestion: "First concert?", statuses: {}, settlements: {},
    expenses: [
      { id: "lz0abc12-xyz1", description: "koffie", amount: 3.4, currency: "EUR", paidBy: "Thijs", date: "2026-03-14" },
      { id: "lz0abc13-xyz2", description: "koffie", amount: 3.6, currency: "EUR", paidBy: "Thijs", date: "2026-03-16" },
      { id: "lz0abc14-xyz3", description: "Padel Sunday", amount: 32, currency: "EUR", paidBy: "Noor", date: "2026-03-17" },
    ] })));
  await old.page.goto(BASE);
  await old.page.getByText("from Schplitz 1").waitFor();
  await shot(old.page, "11-v1-card");
  await old.page.getByRole("button", { name: "Bring it in" }).click();
  await old.page.getByLabel("Answer", { exact: true }).fill("radiohead");
  await old.page.getByLabel("Answer again").fill("radiohead");
  await old.page.getByRole("button", { name: "Bring it in" }).click();
  await old.page.getByText("came along").waitFor();
  await shot(old.page, "12-v1-welcome");
  await old.page.getByRole("button", { name: "No, keep the balance" }).click();
  await old.page.getByRole("button", { name: "Details and exact amounts" }).click();
  await old.page.getByRole("button", { name: "Sort old entries" }).click();
  await old.page.getByRole("dialog").waitFor();
  await old.page.getByRole("dialog").locator("section").first().getByRole("button", { name: "Coffee" }).click();
  await shot(old.page, "13-sort");

  for (const [n, p] of [["sofia", sofia], ["liam", liam], ["v1", old]]) console.log(n, "errors:", p.errors.length ? p.errors : "none");
  await browser.close();
  if ([sofia, liam, old].some(phone => phone.errors.length)) throw new Error("Browser console errors occurred");
  console.log("screens:", shots.join(", "));
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
