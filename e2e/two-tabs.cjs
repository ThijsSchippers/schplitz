// Browser check: a link opened in a second tab updates the first tab (cache.js BroadcastChannel).
// Run like the other scripts in e2e/ (needs a preview server on port 4173).
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const sofiaCtx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] }), liamCtx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  for (const ctx of [sofiaCtx, liamCtx]) await ctx.addInitScript(() => sessionStorage.setItem("schplitz2Opened", "1"));
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
  await b.close();
})().catch(e => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); });
