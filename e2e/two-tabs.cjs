// Browser check: a link opened in a second tab updates the first tab (cache.js BroadcastChannel).
// Run like the other scripts in e2e/ (needs a preview server on port 4173).
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const sofiaCtx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] }), liamCtx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const errors = [];
  for (const ctx of [sofiaCtx, liamCtx]) ctx.on("page", page => {
    page.on("pageerror", error => errors.push(error.message));
  });
  for (const ctx of [sofiaCtx, liamCtx]) await ctx.addInitScript(() => {
    // Init scripts also run on the opaque about:blank page before navigation.
    if (location.protocol === "http:" || location.protocol === "https:") sessionStorage.setItem("schplitz2Opened", "1");
  });
  const s = await sofiaCtx.newPage(), l1 = await liamCtx.newPage();
  const link = async (p) => { await p.getByRole("button", { name: "Copy link" }).click(); const u = await p.getByRole("textbox", { name: "Link" }).inputValue(); await p.getByRole("button", { name: "Close" }).click(); return u; };
  await s.goto((process.env.BASE ?? "http://localhost:4173/v2/"));
  await s.getByRole("button", { name: "Start a tally" }).click();
  await s.getByLabel("Your name").fill("Sofia"); await s.getByLabel("Who's it with?").fill("Liam");
  await s.getByLabel("A question only you two can answer").fill("Q?"); await s.getByLabel("Answer", { exact: true }).fill("a"); await s.getByLabel("Answer again").fill("a");
  await s.getByRole("button", { name: "Start", exact: true }).click(); await s.getByRole("dialog").waitFor();
  const invite = await link(s);
  await l1.goto(invite); await l1.getByLabel("Your answer").fill("a"); await l1.getByRole("button", { name: "Open", exact: true }).click();
  await l1.getByRole("button", { name: "Liam" }).click(); await l1.getByText("You're about even").waitFor();
  // Sofia pays; Liam opens her link in a NEW tab while tab 1 is still open on the tally.
  await s.getByRole("button", { name: "I paid" }).click(); await s.getByRole("button", { name: "Meals" }).click();
  for (const k of ["5", "0"]) await s.getByRole("button", { name: k, exact: true }).click();
  await s.getByRole("button", { name: "Add meal" }).click(); await s.getByRole("dialog").waitFor();
  const update = await link(s);
  const l2 = await liamCtx.newPage();
  await l2.goto(update); await l2.getByText("New from Sofia").waitFor();
  await l1.getByText("Next one's on you").waitFor({ timeout: 5000 });
  console.log("tab 1 updated by tab 2:", await l1.locator("main section p").first().textContent());
  // Both forms intentionally stay stale: BroadcastChannel is an enhancement,
  // not the mechanism that protects simultaneous writes.
  await sofiaCtx.addInitScript(() => { globalThis.BroadcastChannel = undefined; });
  const left = await sofiaCtx.newPage(), right = await sofiaCtx.newPage();
  const openSaved = async page => {
    await page.goto(process.env.BASE ?? "http://localhost:4173/v2/");
    await page.getByRole("button", { name: /Liam/ }).click();
    await page.getByRole("button", { name: "I paid" }).waitFor();
  };
  for (const [page, amount] of [[left, "12"], [right, "34"]]) {
    await openSaved(page);
    await page.getByRole("button", { name: "I paid" }).click();
    await page.getByRole("button", { name: "Coffee", exact: true }).click();
    for (const digit of amount) await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await Promise.all([left, right].map(page => page.getByRole("button", { name: "Add coffee" }).click()));
  await Promise.all([left, right].map(page => page.getByRole("dialog", { name: "Share with Liam" }).waitFor()));
  const readSaved = page => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("schplitz-v2");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("tallies", "readonly");
      const read = tx.objectStore("tallies").getAll();
      read.onsuccess = () => { db.close(); resolve(read.result[0]); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }));
  const saved = await readSaved(left);
  const coffees = Object.values(saved.logs).flatMap(Object.values).filter(entry => entry.t === "pay" && entry.k === 7);
  if (JSON.stringify(coffees.map(entry => entry.a).sort((a, z) => a - z)) !== "[1200,3400]" ||
      new Set(coffees.map(entry => entry.s)).size !== 2) throw new Error("Simultaneous tab saves lost a payment or reused a sequence");
  console.log("simultaneous tab payments preserved without BroadcastChannel");

  // Two stale edit forms must not silently overwrite one another.
  for (const page of [left, right]) {
    await openSaved(page);
    await page.getByRole("button", { name: "Details and exact amounts" }).click();
    await page.getByRole("button", { name: /^Meals/ }).click();
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
  }
  await left.getByRole("button", { name: "6", exact: true }).click();
  await left.getByRole("button", { name: "0", exact: true }).click();
  await left.getByRole("button", { name: "Save changes" }).click();
  await left.getByRole("dialog", { name: "Share with Liam" }).waitFor();
  await right.getByRole("button", { name: "7", exact: true }).click();
  await right.getByRole("button", { name: "0", exact: true }).click();
  await right.getByRole("button", { name: "Save changes" }).click();
  await right.getByRole("alert").filter({ hasText: /changed in another tab/ }).waitFor();
  const edited = await readSaved(right);
  const corrections = Object.values(edited.logs).flatMap(Object.values).filter(entry => entry.t === "edit");
  if (corrections.length !== 1 || corrections[0].ch.a !== 6000) throw new Error("A stale edit overwrote the first correction");
  console.log("stale tab edit rejected with an actionable message");
  await b.close();
  if (errors.length) throw new Error(errors.join("; "));
})().catch(e => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); });
