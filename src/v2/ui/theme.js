// Colours, fonts and shared styles: the light purple-and-blue look of the landing page
// (Landing.jsx). Styles are inline objects, so the CSP needs no extra style sources.
// Text colours meet WCAG AA (4.5:1) on bg, card and accentTint:
//   text ≥ 10, soft ≥ 8, muted ≥ 5.7, accent ≥ 4.9, other ≥ 5.3, danger ≥ 5.6, ok ≥ 4.7 (card and bg only).
//   On navy: cream 13.7, mist 10.7. Cream on accent 5.6; white on dangerFill 6.5.
export const C = {
  bg: "#F5F4FE", card: "#FFFFFF", cardBorder: "#E2DFFE", field: "#FFFFFF", fieldBorder: "#CFC9F3",
  text: "#3C315B", soft: "#4A4170", muted: "#5F5688",
  accent: "#2F5FD0", accentTint: "#E6F0FF", accentBorder: "#8FA8F5", onAccent: "#FFFDF8",
  other: "#7048C8", danger: "#B3261E", dangerFill: "#B3261E", ok: "#2E7D32",
  // From the landing page, for the hero card and highlights.
  navy: "#1B2A55", navyEnd: "#2B2F7A", mist: "#D6E2FF", cream: "#FFFDF8", purple: "#AB9FF2", lav: "#E2DFFE", butter: "#FFFFC4",
};

export const FONT = "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const S = {
  page: { minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: FONT, display: "flex", justifyContent: "center" },
  column: { width: "100%", maxWidth: 480, padding: "12px 16px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 },
  card: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 24, padding: 18, boxShadow: "0 6px 20px rgba(27,42,85,.06)" },
  // The big "whose turn" card: the navy gradient of the landing page's closing section.
  heroCard: { background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyEnd} 60%, ${C.accent} 100%)`, color: C.cream, border: "none", borderRadius: 28, padding: "24px 20px",
    boxShadow: "0 14px 36px rgba(27,42,85,.22)" },
  h1: { fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.6 },
  h2: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.3 },
  sectionLabel: { fontSize: 15, fontWeight: 700, letterSpacing: -0.2, color: C.soft, margin: "10px 0 0" },
  muted: { color: C.muted, fontSize: 13, margin: 0, lineHeight: 1.45 },
  input: {
    width: "100%", boxSizing: "border-box", padding: "13px 16px", background: C.field, border: `1px solid ${C.fieldBorder}`,
    borderRadius: 16, color: C.text, fontSize: 16, outline: "none", fontFamily: FONT,
  },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: C.soft },
  row: { display: "flex", alignItems: "center", gap: 10 },
};

/**
 * Page-wide rules inline styles can't express. Rendered by App, so they apply wherever
 * Schplitz 2 is served (/v2/, and / after launch, whose index.html is shared with Schplitz 1).
 */
export const GLOBAL_CSS = `
html, body { margin: 0; background: ${C.bg}; -webkit-text-size-adjust: 100%; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid ${C.accent}; outline-offset: 2px; }
::placeholder { color: ${C.muted}; opacity: .75; }
`;
