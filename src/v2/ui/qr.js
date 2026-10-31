// QR codes for "scan to sync" across a table (docs §3.7). Generated on the phone with
// qrcode-generator (MIT); rendered as one SVG path, so no images and no network.
import qrcode from "qrcode-generator";

/** Links up to this long make a QR code that phone cameras still read easily. */
export const QR_MAX_LENGTH = 1500;

/**
 * The SVG path for `text` as a QR code, with a 4-module quiet zone.
 * Returns { size, path } in module units, or null when the text is too long to scan well.
 */
export function qrPath(text) {
  if (text.length > QR_MAX_LENGTH) return null;
  const qr = qrcode(0, "L");   // version chosen automatically; low error correction keeps it sparse
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount(), quiet = 4;
  let path = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return { size: n + 2 * quiet, path };
}
