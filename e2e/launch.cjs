// Browser check of the launch switch (docs/launch.md). Needs two preview servers:
//   npm run build && npx vite preview --port 4173                                   (default: Schplitz 1 at /)
//   VITE_V2_AT_ROOT=true npx vite build --outDir dist-launch && npx vite preview --outDir dist-launch --port 4174
// Env: DEFAULT_BASE (default http://localhost:4173), LAUNCH_BASE (default http://localhost:4174).
const { chromium } = require("playwright");
const DEFAULT_BASE = process.env.DEFAULT_BASE ?? "http://localhost:4173";
const LAUNCH = process.env.LAUNCH_BASE ?? "http://localhost:4174";

(async () => {
  const { encryptCompressed, compressToUrl } = await import("../src/utils.js");
  const expenses = [
    { i: "lz0abc12-xyz1", d: "koffie", a: 7.4, c: "EUR", p: "Sofia", t: "2026-03-14" },
    { i: "lz0abc13-xyz2", d: "bier", a: 24, c: "EUR", p: "Liam", t: "2026-03-15" },
  ];
  const payload = { v: 4, question: "Where did we meet?", names: ["Sofia", "Liam"], encrypted: await encryptCompressed(JSON.stringify({ expenses, status: "done" }), "lisbon") };
  const oldLink = `${LAUNCH}/#share=${await compressToUrl(JSON.stringify(payload))}`;

  const browser = await chromium.launch();
  const errors = [];
  const page = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(e.message));
    p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    return p;
  };

  // Default build: Schplitz 1 at "/".
  const d = await page();
  await d.goto(`${DEFAULT_BASE}/`);
  await d.getByRole("heading", { level: 1, name: /Split costs with a friend/ }).waitFor();
  console.log("default build, /: Schplitz 1 landing");

  // Launch build: the landing page at "/" for newcomers, then Schplitz 2, installable, no preview badge.
  const p = await page();
  await p.goto(`${LAUNCH}/`);
  await p.getByRole("heading", { level: 1, name: "Who's buying the next round?" }).waitFor();
  await p.getByRole("button", { name: "Open Schplitz" }).click();
  await p.getByRole("button", { name: "Start a tally" }).waitFor();
  const badge = await p.getByText("2 · preview").count();
  const manifest = await p.locator('link[rel="manifest"]').getAttribute("href");
  console.log(`launch build, /: Schplitz 2 | preview badge: ${badge ? "shown" : "hidden"} | manifest: ${manifest}`);

  // An old Schplitz 1 link opens in Schplitz 2 and brings the tally in.
  await p.goto(oldLink);
  await p.getByText("This link is from the old version of Schplitz.").waitFor();
  await p.getByLabel("Your answer").fill("Lisbon");
  await p.getByRole("button", { name: "Liam", exact: true }).click();
  await p.getByRole("button", { name: "Open", exact: true }).click();
  await p.getByText("came along").waitFor();
  console.log("old link: tally brought in |", (await p.getByRole("status").textContent()).trim());

  // Links made at "/" point at "/".
  await p.getByRole("button", { name: "No, keep the balance" }).click();
  await p.getByRole("button", { name: /^Share with/ }).click();
  await p.getByRole("button", { name: "Copy link" }).click();
  const url = await p.getByRole("textbox", { name: "Link" }).inputValue();
  console.log("new link starts with:", url.slice(0, LAUNCH.length + 6));
  if (!url.startsWith(`${LAUNCH}/#s=`)) throw new Error("link doesn't point at /");

  // /classic/ is Schplitz 1, /v2/ is still Schplitz 2.
  const c = await page();
  await c.goto(`${LAUNCH}/classic/`);
  await c.getByRole("heading", { level: 1, name: /Split costs with a friend/ }).waitFor();
  const v2 = await page();
  await v2.goto(`${LAUNCH}/v2/`);
  await v2.getByRole("button", { name: "Open Schplitz" }).click();   // newcomers see the landing page first
  await v2.getByText("2 · preview").waitFor();
  console.log("/classic/: Schplitz 1 | /v2/: Schplitz 2 preview");

  console.log("console errors:", errors.length ? errors : "none");
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error("FAILED:", e.message.split("\n").slice(0, 4).join("\n")); process.exit(1); });
