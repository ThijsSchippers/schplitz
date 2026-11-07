import "./tokens.css";

// Colours, fonts and shared styles: the light purple-and-blue look of the landing page
// (Landing.jsx). Both use tokens.css as the source of shared values.
// Text colours meet WCAG AA (4.5:1) on bg, card and accentTint:
//   text ≥ 10, soft ≥ 8, muted ≥ 5.7, accent ≥ 4.9, other ≥ 5.3, danger ≥ 5.6, ok ≥ 4.7 (card and bg only).
//   On navy: cream 13.7, mist 10.7. Cream on accent 5.6; white on dangerFill 6.5.
// CSS owns the values; these references keep inline styles readable.
export const C = {
  bg: "var(--schplitz-bg)",
  card: "var(--schplitz-card)",
  cardBorder: "var(--schplitz-card-border)",
  field: "var(--schplitz-field)",
  fieldBorder: "var(--schplitz-field-border)",
  text: "var(--schplitz-text)",
  soft: "var(--schplitz-soft)",
  muted: "var(--schplitz-muted)",
  accent: "var(--schplitz-accent)",
  accentTint: "var(--schplitz-accent-tint)",
  accentBorder: "var(--schplitz-accent-border)",
  onAccent: "var(--schplitz-on-accent)",
  other: "var(--schplitz-other)",
  danger: "var(--schplitz-danger)",
  dangerBorder: "var(--schplitz-danger-border)",
  dangerFill: "var(--schplitz-danger-fill)",
  ok: "var(--schplitz-ok)",
  navy: "var(--schplitz-navy)",
  navyEnd: "var(--schplitz-navy-end)",
  mist: "var(--schplitz-mist)",
  cream: "var(--schplitz-cream)",
  purple: "var(--schplitz-purple)",
  lav: "var(--schplitz-lav)",
  butter: "var(--schplitz-butter)",
};

export const FONT = "var(--schplitz-font)";

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
