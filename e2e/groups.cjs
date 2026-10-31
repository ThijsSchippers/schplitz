// Browser walkthrough: a group of three on three phones, adding someone later, a full-copy
// file restoring a wiped phone, the new-phone notice, QR codes and the app manifest.
// Run like the other scripts in e2e/ (needs a preview server on port 4173).
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:4173/v2/";
const os = require("os"), path = require("path"), fs = require("fs");

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const phone = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    return page;
  };
  const copyLink = async (p) => {
    const dialog = p.getByRole("dialog");
    await dialog.getByRole("button", { name: "Copy link" }).click();
    const url = await dialog.getByRole("textbox", { name: "Link" }).inputValue();
    await dialog.getByRole("button", { name: "Close" }).click();
    return url;
  };
  const join = async (p, url, name) => {
    await p.goto(url);
    await p.getByLabel("Your answer").fill("smash");
    await p.getByRole("button", { name: "Open", exact: true }).click();
    await p.getByRole("button", { name, exact: true }).click();
  };
  const heroText = async (p) => (await p.locator("main section p").first().textContent()).trim();

  // Ana starts "Padel crew" with Ben and Cas.
  const ana = await phone();
  await ana.goto(BASE);
  await ana.getByRole("button", { name: "Start a tally" }).click();
  await ana.getByLabel("Your name").fill("Ana");
  await ana.getByLabel("Who's it with?").fill("Ben");
  await ana.getByRole("button", { name: "Add someone" }).click();
  await ana.getByRole("textbox", { name: "Person 3" }).fill("Cas");
  await ana.getByLabel("Name for the group (optional)").fill("Padel crew");
  await ana.getByLabel("A question only your group can answer").fill("Club name?");
  await ana.getByLabel("Answer", { exact: true }).fill("smash");
  await ana.getByLabel("Answer again").fill("smash");
  await ana.getByRole("button", { name: "Start", exact: true }).click();
  await ana.getByRole("dialog").waitFor();
  const invite = await copyLink(ana);

  const ben = await phone(), cas = await phone();
  await join(ben, invite, "Ben");
  await join(cas, invite, "Cas");
  await cas.getByRole("heading", { name: "Padel crew" }).waitFor();

  // Ana pays for court and drinks; Cas wasn't there for the drinks.
  const pay = async (p, cat, keys, add, skip = []) => {
    await p.getByRole("button", { name: "I paid" }).click();
    await p.getByRole("button", { name: cat }).click();
    if (skip.length) {
      await p.getByRole("button", { name: /Who was there/ }).click();
      for (const s of skip) await p.getByRole("dialog").getByRole("button", { name: s, exact: true }).click();
      await p.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    }
    for (const k of keys) await p.getByRole("button", { name: k, exact: true }).click();
    await p.getByRole("button", { name: add }).click();
    await p.getByRole("dialog").waitFor();
  };
  await pay(ana, "Courts", ["4", "5"], "Add court");
  await ana.getByRole("dialog").getByRole("button", { name: "Later" }).click();
  await pay(ana, "Drinks", ["3", "0"], "Add drinks", ["Cas"]);
  await ana.getByRole("dialog").getByRole("button", { name: "Show QR code" }).click();
  await ana.getByRole("img", { name: "QR code of the link" }).waitFor();
  if (process.env.SHOTS) await ana.screenshot({ path: `${process.env.SHOTS}/g1-qr.png` });
  const afterDrinks = await copyLink(ana);

  await ben.goto(afterDrinks);
  await ben.getByText("New from Ana").waitFor();
  console.log("Ben's review:", (await ben.getByRole("dialog").textContent()).replace(/\s+/g, " ").slice(0, 120));
  await ben.getByRole("button", { name: "Done" }).click();
  await cas.goto(afterDrinks);
  await cas.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  console.log("Ben:", await heroText(ben), "| Cas:", await heroText(cas));
  if (process.env.SHOTS) await ben.screenshot({ path: `${process.env.SHOTS}/g2-ben.png`, fullPage: true });

  // Ben treats everyone to coffee, so his phone has history of its own.
  await pay(ben, "Coffee", ["9"], "Add coffee");
  await ana.goto(await copyLink(ben));
  await ana.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  // Ana adds Dee later; Dee joins from Ana's next link.
  await ana.getByRole("button", { name: "Details and exact amounts" }).click();
  await ana.getByRole("button", { name: "Add someone" }).click();
  await ana.getByLabel("Their name").fill("Dee");
  await ana.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await ana.getByRole("dialog", { name: "Share with the group" }).waitFor();
  const withDee = await copyLink(ana);
  const dee = await phone();
  await join(dee, withDee, "Dee");
  console.log("Dee joined:", await heroText(dee));

  // Ben's phone is wiped. Ana sends a full copy as a file; Ben's new phone opens it.
  await ana.getByRole("button", { name: "Send a full copy" }).click();
  const [download] = await Promise.all([ana.waitForEvent("download"), ana.getByRole("button", { name: "Download the file" }).click()]);
  const file = path.join(os.tmpdir(), download.suggestedFilename());
  await download.saveAs(file);
  console.log("full copy file:", download.suggestedFilename(), fs.statSync(file).size, "bytes");
  await ana.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  const bensNewPhone = await phone();
  await bensNewPhone.goto(BASE);
  await bensNewPhone.getByLabel("Full copy file").setInputFiles(file);
  await bensNewPhone.getByLabel("Your answer").fill("smash");
  await bensNewPhone.getByRole("button", { name: "Open", exact: true }).click();
  await bensNewPhone.getByText("already uses Schplitz on another phone").first().waitFor();
  await bensNewPhone.getByRole("button", { name: "Ben", exact: true }).click();
  await bensNewPhone.getByText("Welcome back").waitFor();
  console.log("Ben restored from file:", await heroText(bensNewPhone));

  // Ben's new phone pays; Ana is told he has a new phone.
  await pay(bensNewPhone, "Coffee", ["1", "2"], "Add coffee");
  const fromNewPhone = await copyLink(bensNewPhone);
  await ana.goto(fromNewPhone);
  await ana.getByText("Ben is using a new phone.").waitFor();
  console.log("Ana sees: Ben is using a new phone.");

  // The manifest is served and valid.
  const manifest = await (await ana.request.get(new URL("manifest.webmanifest", BASE).href)).json();
  console.log("manifest:", manifest.name, manifest.start_url, manifest.icons.length, "icons");

  console.log("console errors:", errors.length ? errors : "none");
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error("FAILED:", e.message.split("\n").slice(0, 4).join("\n")); process.exit(1); });
