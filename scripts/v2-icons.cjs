// Draws the Schplitz 2 app icons: the landing page's logo, an ink "S" on a purple-to-periwinkle gradient.
const { chromium } = require('playwright');
// Run from the repo root: node scripts/v2-icons.cjs  (writes to public/v2/; needs the Inter font installed)
const out = process.argv[2] ?? "public/v2";
const GRAD = 'linear-gradient(135deg, #AB9FF2 0%, #8FA8F5 100%)';
// [file, size, full-bleed?, letter size as a share of the canvas, inset of the tile]
const ICONS = [
  ['icon-192.png', 192, false, 0.56, 0.06],
  ['icon-512.png', 512, false, 0.56, 0.06],
  ['icon-maskable-512.png', 512, true, 0.44, 0],   // the letter stays inside the 80% safe zone
  ['apple-touch-icon.png', 180, true, 0.6, 0],      // iOS rounds the corners itself
];
(async () => {
  const b = await chromium.launch();
  for (const [file, size, bleed, letter, inset] of ICONS) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const tile = size * (1 - 2 * inset), radius = bleed ? 0 : tile * 0.3;
    await p.setContent(`<html><body style="margin:0;background:transparent">
      <div style="position:absolute;left:${size * inset}px;top:${size * inset}px;width:${tile}px;height:${tile}px;border-radius:${radius}px;background:${GRAD};
        display:grid;place-items:center;font-family:Inter;font-weight:800;font-size:${size * letter}px;line-height:1;color:#3C315B;letter-spacing:-0.02em">
        <span style="transform:translateY(-3%)">S</span></div></body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${out}/${file}`, omitBackground: !bleed });
    await p.close();
  }
  await b.close();
})();
