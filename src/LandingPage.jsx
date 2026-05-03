import { useState, useEffect } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const MONO  = "'Courier New',Courier,monospace";
const SERIF = "Georgia,'Times New Roman',serif";
const SANS  = "system-ui,-apple-system,sans-serif";

const SPEC_ROWS = [
  ["CIPHER",      "AES-256-GCM"],
  ["KDF",         "PBKDF2-SHA256"],
  ["ITERATIONS",  "200,000"],
  ["SALT",        "16 bytes · random"],
  ["IV",          "12 bytes · random"],
  ["STORAGE",     "localStorage (your device)"],
  ["NETWORK",     "none"],
];

const FULL_SPEC_ROWS = [
  ["CIPHER",          "AES-256-GCM"],
  ["KEY DERIVATION",  "PBKDF2-SHA256"],
  ["KDF ITERATIONS",  "200,000"],
  ["SALT LENGTH",     "128-bit (16 bytes, random)"],
  ["IV LENGTH",       "96-bit (12 bytes, random)"],
  ["PLAINTEXT FORMAT","JSON · UTF-8"],
  ["COMPRESSION",     "deflate-raw (URL payload)"],
  ["STORAGE",         "localStorage · client only"],
  ["NETWORK CALLS",   "None (currency API optional)"],
  ["TELEMETRY",       "None"],
  ["SERVER",          "None"],
  ["ACCOUNT REQUIRED","No"],
];

const MOMENTS = [
  { src: "/images/bar-couple.jpg",    loc: "BAR / BERLIN",   amt: "€ 34.50", split: "÷ 2 = € 17.25" },
  { src: "/images/beach-friends.jpg", loc: "BEACH / SPLIT",  amt: "€ 127.80",split: "÷ 2 = € 63.90" },
  { src: "/images/coffee-chat.jpg",   loc: "CAFÉ / LISBON",  amt: "€ 12.20", split: "÷ 2 = € 6.10"  },
];

const PROBLEMS = [
  { src: "/images/city-night.jpg",   title: "Synced to the cloud",       body: "Every expense uploaded to a server you don't own." },
  { src: "/images/bar-friends.jpg",  title: "Mined for insights",        body: "Your spending habits become data points in someone else's system." },
  { src: "/images/hiking.jpg",       title: "Shared with third parties",  body: "Ad networks, processors — your data gets passed around." },
];

const STEPS = [
  { n: "01", title: "Set a shared secret",    body: "Pick a security question only you two would know. The answer is the encryption key — we never see it." },
  { n: "02", title: "Log your expenses",      body: "Add what you spent. Everything stays on your device. Nothing is transmitted without your action." },
  { n: "03", title: "Share an encrypted link",body: "Generate a link. Your expenses are encrypted before they touch the URL. The other person decrypts with the same answer." },
  { n: "04", title: "See who owes what",      body: "Schplitz calculates the balance across currencies at the historical exchange rate. No account required — just the number." },
];

// ─── RESPONSIVE CSS ───────────────────────────────────────────────────────────

const RESPONSIVE_CSS = `
  /* Tablet ≤ 900px */
  @media (max-width: 900px) {
    .lp-nav          { padding: 16px 24px !important; }
    .lp-hero         { grid-template-columns: 1fr !important; min-height: auto !important; }
    .lp-hero-left    { padding: 64px 24px 48px !important; }
    .lp-hero-right   { height: 54vw; min-height: 220px; position: relative !important; }
    .lp-hero-bleed   { background: linear-gradient(to bottom, #09090d 0%, rgba(9,9,13,0.15) 35%, transparent 65%) !important; }
    .lp-moments      { height: 56vw !important; max-height: 380px !important; }
    .lp-prob-grid    { grid-template-columns: 1fr 1fr !important; }
    .lp-section      { padding: 80px 24px !important; }
    .lp-spec-panel   { grid-template-columns: 1fr !important; }
    .lp-spec-img     { display: none !important; }
    .lp-spec-content { padding: 64px 24px !important; }
    .lp-footer       { padding: 40px 24px !important; }
  }

  /* Reduce motion */
  @media (prefers-reduced-motion: reduce) {
    .lp-cursor { transition: none !important; }
  }

  /* Mobile ≤ 640px */
  @media (max-width: 640px) {
    .lp-hero-left    { padding: 48px 20px 40px !important; }
    .lp-hero-right   { height: 72vw !important; }
    .lp-moments      {
      grid-template-columns: repeat(3, 82vw) !important;
      height: 76vw !important;
      max-height: 420px !important;
      overflow-x: auto !important;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
    }
    .lp-moment       { scroll-snap-align: start; }
    .lp-prob-grid    { grid-template-columns: 1fr !important; }
    .lp-prob-card    { height: 300px !important; }
    .lp-section      { padding: 64px 20px !important; }
    .lp-step         { grid-template-columns: 44px 1fr !important; gap: 18px !important; }
    .lp-step-num     { font-size: 26px !important; }
    .lp-spec-content { padding: 56px 20px !important; }
    .lp-footer       { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; padding: 36px 20px !important; }
  }
`;

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function LandingPage({ onLaunch }) {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    // Respect prefers-reduced-motion — keep cursor static if user opts out of animation
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setCursorVisible(v => !v), 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={L.page}>
      <style>{RESPONSIVE_CSS}</style>

      {/* ── NAV ── */}
      <nav className="lp-nav" style={L.nav} aria-label="Main navigation">
        <span style={L.logo}>SCHPLITZ</span>
        <button onClick={onLaunch} style={L.navCta}>OPEN APP</button>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero" style={L.hero}>
        <div className="lp-hero-left" style={L.heroLeft}>
          <span style={L.eyebrow}>SCHPLITZ // CLIENT-SIDE ONLY</span>
          <h1 style={L.heroH1}>
            Don't let your purchase history{" "}
            <span style={L.accent}>haunt</span> your future.
          </h1>

          <div style={L.termBox}>
            {SPEC_ROWS.map(([k, v]) => (
              <div key={k} style={L.termRow}>
                <span style={L.termKey}>{k}</span>
                <span style={L.termVal}>{v}</span>
              </div>
            ))}
            <div style={L.termRow}>
              <span style={L.termKey}>STATUS</span>
              <span style={L.termVal}>
                READY
                <span aria-hidden="true" style={{ ...L.cursor, opacity: cursorVisible ? 0.8 : 0 }} />
              </span>
            </div>
          </div>

          <div style={L.heroActs}>
            <button onClick={onLaunch} style={L.heroCta}>OPEN SCHPLITZ →</button>
            <span style={L.heroNote}>NO ACCOUNT · NO DATABASE · NO CLOUD</span>
          </div>
        </div>

        <div className="lp-hero-right" style={L.heroRight}>
          <img src="/images/city-night.jpg" alt="" style={L.heroImg} loading="eager" />
          <div className="lp-hero-bleed" style={L.heroBleed} />
        </div>
      </section>

      {/* ── MOMENT STRIP ── */}
      <div className="lp-moments" style={L.moments}>
        {MOMENTS.map(m => (
          <div className="lp-moment" key={m.loc} style={L.moment}>
            <img src={m.src} alt="" style={L.momentImg} loading="lazy" />
            <div style={L.momentScrim} />
            <div style={L.momentMeta}>
              <span style={L.momentLoc}>{m.loc}</span>
              <span style={L.momentAmt}>{m.amt}</span>
              <span style={L.momentSplit}>{m.split}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── PROBLEM ── */}
      <section className="lp-section" style={L.section}>
        <div style={L.sectionHead}>
          <span style={L.eyebrow}>THE UNCOMFORTABLE TRUTH</span>
          <h2 style={L.sectionH2}>Other apps know <span style={L.accent}>too much.</span></h2>
        </div>
        <div className="lp-prob-grid" style={L.problemGrid}>
          {PROBLEMS.map(c => (
            <div className="lp-prob-card" key={c.title} style={L.probCard}>
              <img src={c.src} alt="" style={L.probImg} loading="lazy" />
              <div style={L.probOverlay}>
                <h3 style={L.probTitle}>{c.title}</h3>
                <p style={L.probBody}>{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PHOTO BREAK + QUOTE ── */}
      <div style={L.photoBreak}>
        <img src="/images/couple-nature.jpg" alt="" style={L.photoBreakImg} loading="lazy" />
        <div style={L.photoBreakScrim} />
        <div style={L.photoBreakContent}>
          <div style={L.quoteLine} />
          <p style={L.quoteText}>
            "The best place to store sensitive data is somewhere no one else can reach it."
          </p>
          <span style={L.quoteAttr}>SCHPLITZ · CLIENT-SIDE ONLY</span>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-section" style={{ ...L.section, maxWidth: 840 }}>
        <div style={L.sectionHead}>
          <span style={L.eyebrow}>HOW IT WORKS</span>
          <h2 style={L.sectionH2}>Simple.<br /><span style={L.accent}>By design.</span></h2>
        </div>
        <div>
          {STEPS.map((s, i) => (
            <div className="lp-step" key={s.n} style={{ ...L.step, ...(i === 0 ? { borderTop: "1px solid rgba(255,255,255,0.06)" } : {}) }}>
              <span className="lp-step-num" style={L.stepNum}>{s.n}</span>
              <div>
                <h3 style={L.stepTitle}>{s.title}</h3>
                <p style={L.stepDesc}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TECH SPEC PANEL ── */}
      <div className="lp-spec-panel" style={L.specPanel}>
        <div className="lp-spec-img" style={L.specImgWrap}>
          <img src="/images/managing-finances.jpg" alt="" style={L.specImg} loading="lazy" />
          <div style={L.specBleed} />
        </div>
        <div className="lp-spec-content" style={L.specContent}>
          <span style={L.eyebrow}>TECHNICAL SPECIFICATION</span>
          <h2 style={L.specH2}>Built on Web Crypto.<br /><span style={L.accent}>Nothing else.</span></h2>
          <table style={L.specTable}>
            <tbody>
              {FULL_SPEC_ROWS.map(([k, v]) => (
                <tr key={k} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={L.specKey}>{k}</td>
                  <td style={L.specVal}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={L.specNote}>
            All cryptographic operations use the browser's native SubtleCrypto API.
          </p>
        </div>
      </div>

      {/* ── CTA ── */}
      <section style={L.ctaSection}>
        <img src="/images/sunset-couple.jpg" alt="" style={L.ctaBgImg} loading="lazy" />
        <div style={L.ctaScrim} />
        <div style={L.ctaInner}>
          <span style={L.eyebrow}>READY WHEN YOU ARE</span>
          <h2 style={L.ctaH2}>
            Your money.<br /><span style={L.accent}>Your business.</span>
          </h2>
          <p style={L.ctaNote}>NO DOWNLOADS · NO INSTALLS · OPEN AND GO</p>
          <button onClick={onLaunch} style={L.heroCta}>OPEN SCHPLITZ →</button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" style={L.footer}>
        <span style={L.footerLogo}>SCHPLITZ</span>
        <span style={L.footerMid}>AES-256-GCM · PBKDF2 · NO SERVER</span>
        <span style={L.footerRight}>Proudly built in Niederwalluf.</span>
      </footer>

    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const L = {
  page:         { background: "#09090d", color: "#fff", fontFamily: SERIF, minHeight: "100vh", overflowX: "hidden" },

  // Nav
  nav:          { position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 60px", background: "rgba(9,9,13,0.82)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  logo:         { fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#fff" },
  navCta:       { fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", padding: "12px 20px", minHeight: 44, background: "transparent", border: "1px solid rgba(255,255,255,0.30)", borderRadius: 4, color: "rgba(255,255,255,0.85)", cursor: "pointer" },

  // Hero
  hero:         { display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh", overflow: "hidden" },
  heroLeft:     { padding: "100px 60px 80px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, background: "#09090d" },
  heroRight:    { position: "relative", overflow: "hidden" },
  heroImg:      { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center center" },
  heroBleed:    { position: "absolute", inset: 0, background: "linear-gradient(to right, #09090d 0%, rgba(9,9,13,0.4) 20%, transparent 45%)" },

  eyebrow:      { fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", color: "#e8d44d", display: "block" },
  heroH1:       { fontFamily: SERIF, fontSize: "clamp(36px,4.2vw,62px)", fontWeight: 700, lineHeight: 1.06, letterSpacing: "-2.5px", color: "#fff", margin: 0 },
  accent:       { color: "#e8d44d" },

  // Terminal box
  termBox:      { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "18px 20px", fontFamily: MONO, fontSize: 13, lineHeight: 1.9 },
  termRow:      { display: "flex", gap: 16, alignItems: "center" },
  termKey:      { color: "rgba(255,255,255,0.50)", minWidth: 100, flexShrink: 0, letterSpacing: "0.06em" },
  termVal:      { color: "rgba(232,212,77,0.90)", display: "flex", alignItems: "center", gap: 6 },
  cursor:       { display: "inline-block", width: 7, height: 11, background: "#e8d44d", verticalAlign: "middle", marginLeft: 4, transition: "opacity 0.1s" },

  heroActs:     { display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" },
  heroCta:      { fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 10, background: "#e8d44d", border: "none", borderRadius: 4, color: "#09090d", padding: "14px 32px", minHeight: 44, cursor: "pointer" },
  heroNote:     { fontFamily: MONO, fontSize: 12, letterSpacing: "0.14em", color: "rgba(255,255,255,0.40)" },

  // Moment strip
  moments:      { display: "grid", gridTemplateColumns: "repeat(3,1fr)", height: "45vw", maxHeight: 480 },
  moment:       { position: "relative", overflow: "hidden" },
  momentImg:    { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" },
  momentScrim:  { position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(9,9,13,0.88) 0%, transparent 55%)" },
  momentMeta:   { position: "absolute", bottom: 24, left: 24, display: "flex", flexDirection: "column", gap: 4 },
  momentLoc:    { fontFamily: MONO, fontSize: 12, letterSpacing: "0.2em", color: "rgba(255,255,255,0.75)" },
  momentAmt:    { fontFamily: MONO, fontSize: "clamp(24px,3.2vw,42px)", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 },
  momentSplit:  { fontFamily: MONO, fontSize: 13, color: "#e8d44d", letterSpacing: "0.04em" },

  // Sections
  section:      { maxWidth: 1100, margin: "0 auto", padding: "120px 60px" },
  sectionHead:  { marginBottom: 56 },
  sectionH2:    { fontFamily: SERIF, fontSize: "clamp(34px,5vw,54px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-2px", color: "#fff", margin: "12px 0 0" },

  // Problem cards — text ON the photo
  problemGrid:  { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 2 },
  probCard:     { position: "relative", overflow: "hidden", height: 400 },
  probImg:      { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" },
  probOverlay:  { position: "absolute", bottom: 0, left: 0, right: 0, padding: "80px 24px 28px", background: "linear-gradient(to top, rgba(9,9,13,0.95) 0%, transparent 100%)" },
  probTitle:    { fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 },
  probBody:     { fontFamily: MONO, fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.85)", margin: 0 },

  // Photo break
  photoBreak:         { position: "relative", height: "70vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  photoBreakImg:      { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" },
  photoBreakScrim:    { position: "absolute", inset: 0, background: "rgba(9,9,13,0.52)" },
  photoBreakContent:  { position: "relative", zIndex: 1, textAlign: "center", maxWidth: 680, padding: "0 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  quoteLine:          { width: 48, height: 1, background: "#e8d44d" },
  quoteText:          { fontFamily: SERIF, fontSize: "clamp(20px,3.5vw,34px)", fontWeight: 400, fontStyle: "italic", color: "#fff", lineHeight: 1.5, letterSpacing: "-0.3px", margin: 0 },
  quoteAttr:          { fontFamily: MONO, fontSize: 12, letterSpacing: "0.2em", color: "rgba(255,255,255,0.55)" },

  // Steps
  step:         { display: "grid", gridTemplateColumns: "72px 1fr", gap: 32, padding: "32px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", alignItems: "start" },
  stepNum:      { fontFamily: MONO, fontSize: 36, fontWeight: 700, color: "rgba(232,212,77,0.25)", lineHeight: 1, letterSpacing: "-1px" },
  stepTitle:    { fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 10px", lineHeight: 1.2 },
  stepDesc:     { fontFamily: SANS, fontSize: 15, lineHeight: 1.72, color: "rgba(255,255,255,0.60)", margin: 0, maxWidth: 560 },

  // Spec panel
  specPanel:    { display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "80vh" },
  specImgWrap:  { position: "relative", overflow: "hidden" },
  specImg:      { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center center" },
  specBleed:    { position: "absolute", inset: 0, background: "linear-gradient(to left, #09090d 0%, rgba(9,9,13,0.4) 20%, transparent 45%)" },
  specContent:  { background: "#09090d", padding: "80px 60px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 },
  specH2:       { fontFamily: SERIF, fontSize: "clamp(26px,3vw,40px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-1.5px", color: "#fff", margin: "10px 0 0" },
  specTable:    { width: "100%", borderCollapse: "collapse" },
  specKey:      { fontFamily: MONO, fontSize: 13, color: "rgba(255,255,255,0.50)", letterSpacing: "0.1em", padding: "14px 24px 14px 0", width: "42%", verticalAlign: "top" },
  specVal:      { fontFamily: MONO, fontSize: 13, color: "rgba(255,255,255,0.85)", padding: "14px 0", lineHeight: 1.7 },
  specNote:     { fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,0.40)", letterSpacing: "0.08em", margin: 0, lineHeight: 1.6 },

  // CTA
  ctaSection:   { position: "relative", minHeight: "65vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  ctaBgImg:     { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" },
  ctaScrim:     { position: "absolute", inset: 0, background: "rgba(9,9,13,0.70)" },
  ctaInner:     { position: "relative", zIndex: 1, textAlign: "center", padding: "0 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  ctaH2:        { fontFamily: SERIF, fontSize: "clamp(40px,6vw,72px)", fontWeight: 700, letterSpacing: "-2.5px", lineHeight: 1.04, color: "#fff", margin: 0 },
  ctaNote:      { fontFamily: MONO, fontSize: 13, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)", margin: 0 },

  // Footer
  footer:       { padding: "48px 60px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap", gap: 12 },
  footerLogo:   { fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)" },
  footerMid:    { fontFamily: MONO, fontSize: 12, letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)" },
  footerRight:  { fontFamily: MONO, fontSize: 12, color: "rgba(255,255,255,0.35)" },
};
