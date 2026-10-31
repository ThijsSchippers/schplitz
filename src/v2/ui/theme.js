// Colours and shared styles: the dark and yellow look of Schplitz 1. Styles are inline
// objects, like in Schplitz 1, so the CSP needs no extra style sources.
// Text colours on `bg`/`card` meet WCAG AA (4.5:1): soft ≈ 9:1, muted ≈ 5.1–5.6:1, danger ≈ 4.6–5.1:1.
export const C = {
  bg: "#0f0f13", card: "#1a1a24", cardBorder: "#2a2a3a", field: "#12121a", fieldBorder: "#2e2e3e",
  text: "#ffffff", soft: "#b8b8c8", muted: "#8a8a9a",
  accent: "#e8d44d", accentTint: "#e8d44d15", accentBorder: "#e8d44d88", onAccent: "#0f0f13",
  other: "#5ba9d6", danger: "#e05555", dangerFill: "#b3261e", ok: "#4caf50",   // dangerFill: white text on it ≈ 6.5:1
};

export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const S = {
  page: { minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: FONT, display: "flex", justifyContent: "center" },
  column: { width: "100%", maxWidth: 480, padding: "12px 16px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 },
  card: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 16 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: 600, margin: 0 },
  sectionLabel: { fontSize: 12, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: C.muted, margin: "8px 0 0" },
  muted: { color: C.muted, fontSize: 13, margin: 0, lineHeight: 1.45 },
  input: {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", background: C.field, border: `1px solid ${C.fieldBorder}`,
    borderRadius: 10, color: C.text, fontSize: 16, outline: "none", fontFamily: FONT,
  },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: C.soft },
  row: { display: "flex", alignItems: "center", gap: 10 },
};
