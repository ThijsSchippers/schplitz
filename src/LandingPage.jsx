const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const SPEC_ROWS = [
  ["cipher",    "AES-256-GCM"],
  ["key_len",   "256 bit"],
  ["kdf",       "PBKDF2-SHA256"],
  ["iterations","200,000"],
  ["salt",      "128 bit · random"],
  ["iv",        "96 bit · random"],
  ["storage",   "device only"],
  ["servers",   "0"],
];

const MOMENTS = [
  { src: "/images/bar-friends.jpg",  label: "round of drinks",  amt: "€47.20 / 2" },
  { src: "/images/beach-friends.jpg",label: "beach day",        amt: "€89.50 / 2" },
  { src: "/images/coffee-chat.jpg",  label: "coffee & pastry",  amt: "€11.80 / 2" },
];

const STEPS = [
  { n: "01", title: "Agree on a shared secret",  body: "Pick a security question only you two know the answer to. That answer becomes the encryption key — we never see it." },
  { n: "02", title: "Log your expenses",          body: "Add what you spent. Everything stays on your device. Nothing leaves without your explicit action." },
  { n: "03", title: "Share an encrypted link",    body: "Generate a share link. Your expenses are encrypted before they touch the URL. The other person decrypts with the same answer." },
  { n: "04", title: "Settle up",                  body: "Schplitz calculates who owes what across all currencies at the historical exchange rate. No account required — just the number." },
];

export default function LandingPage({ onLaunch }) {
  return (
    <div style={L.page}>

      {/* ── NAV ── */}
      <nav style={L.nav}>
        <span style={L.logo}>schplitz</span>
        <button onClick={onLaunch} style={L.navCta}>Open App</button>
      </nav>

      {/* ── HERO ── */}
      <section style={L.hero}>
        <div style={L.heroLeft}>
          <span style={L.eyebrow}>expense splitting</span>
          <h1 style={L.heroH1}>
            Split the bill.<br />
            Not your<br />
            <span style={L.accent}>privacy.</span>
          </h1>
          <p style={L.heroP}>
            Log expenses for trips, dinners, and everyday moments.
            Everything is encrypted on your device — nothing stored in the cloud.
          </p>
          <div style={L.termBox}>
            <div style={L.termHeader}>
              <span style={L.termDot} /><span style={L.termDot} /><span style={L.termDot} />
              <span style={L.termTitle}>schplitz · privacy model</span>
            </div>
            {SPEC_ROWS.slice(0, 4).map(([k, v]) => (
              <div key={k} style={L.termRow}>
                <span style={L.termKey}>{k}</span>
                <span style={L.termEq}>=</span>
                <span style={L.termVal}>{v}</span>
              </div>
            ))}
          </div>
          <div style={L.heroActs}>
            <button onClick={onLaunch} style={L.heroCta}>
              Start splitting <Arrow />
            </button>
            <span style={L.heroNote}>no account · no cloud · no tracking</span>
          </div>
        </div>
        <div style={L.heroRight}>
          <img src="/images/hiking.jpg" alt="" style={L.heroImg} loading="eager" />
          <div style={L.heroImgFade} />
        </div>
      </section>

      {/* ── MOMENT STRIP ── */}
      <div style={L.moments}>
        {MOMENTS.map(m => (
          <div key={m.label} style={L.moment}>
            <img src={m.src} alt="" style={L.momentImg} loading="lazy" />
            <div style={L.momentOverlay} />
            <div style={L.momentMeta}>
              <span style={L.momentLabel}>{m.label}</span>
              <span style={L.momentAmt}>{m.amt}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── PROBLEM ── */}
      <section style={L.section}>
        <div style={L.sectionHead}>
          <span style={L.eyebrow}>the uncomfortable truth</span>
          <h2 style={L.sectionH2}>Other apps track<br /><span style={L.accent}>more than your tab.</span></h2>
        </div>
        <div style={L.problemGrid}>
          {[
            { src: "/images/city-night.jpg",        title: "Synced to the cloud",       body: "Every expense you log is uploaded to a server you don't own, run by a company you've never met." },
            { src: "/images/bar-couple.jpg",         title: "Mined for insights",        body: "Your spending habits become data points. Someone, somewhere, is learning what you buy." },
            { src: "/images/managing-finances.jpg",  title: "Shared with third parties", body: "Ad networks, analytics, payment processors — your data gets passed around." },
          ].map(c => (
            <div key={c.title} style={L.probCard}>
              <div style={L.probImgWrap}>
                <img src={c.src} alt="" style={L.probImg} loading="lazy" />
              </div>
              <div style={L.probText}>
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
        <div style={L.photoBreakDim} />
        <div style={L.photoBreakContent}>
          <div style={L.quoteLine} />
          <p style={L.quoteText}>
            "The best place to store sensitive data is&nbsp;somewhere no one else can reach it."
          </p>
          <span style={L.quoteAttr}>The only server Schplitz uses is your device.</span>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section style={L.section}>
        <div style={L.sectionHead}>
          <span style={L.eyebrow}>how it works</span>
          <h2 style={L.sectionH2}>Simple.<br /><span style={L.accent}>By design.</span></h2>
        </div>
        <div style={L.steps}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ ...L.step, ...(i === STEPS.length - 1 ? { borderBottom: "none" } : {}) }}>
              <span style={L.stepNum}>{s.n}</span>
              <div style={L.stepBody}>
                <h3 style={L.stepTitle}>{s.title}</h3>
                <p style={L.stepDesc}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TECH SPEC PANEL ── */}
      <div style={L.specPanel}>
        <div style={L.specImgWrap}>
          <img src="/images/sunset-couple.jpg" alt="" style={L.specImg} loading="lazy" />
        </div>
        <div style={L.specContent}>
          <span style={L.eyebrow}>under the hood</span>
          <h2 style={L.specH2}>Built to be<br /><span style={L.accent}>unreadable.</span></h2>
          <p style={L.specP}>
            Every share link is encrypted before it leaves your browser.
            Even if someone intercepts it, they see only ciphertext.
          </p>
          <div style={L.specTable}>
            {SPEC_ROWS.map(([k, v], i) => (
              <div key={k} style={{ ...L.specRow, ...(i === SPEC_ROWS.length - 1 ? { borderBottom: "none" } : {}) }}>
                <span style={L.specKey}>{k}</span>
                <span style={L.specVal}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <section style={L.ctaSection}>
        <img src="/images/bar-friends.jpg" alt="" style={L.ctaBgImg} loading="lazy" />
        <div style={L.ctaDim} />
        <div style={L.ctaInner}>
          <h2 style={L.ctaH2}>Your money.<br /><span style={L.accent}>Your business.</span></h2>
          <p style={L.ctaP}>No downloads. No installs. Just open and go.</p>
          <button onClick={onLaunch} style={L.heroCta}>
            Open Schplitz <Arrow />
          </button>
          <span style={L.heroNote}>no account · no cloud · no tracking</span>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={L.footer}>
        <span style={L.footerLogo}>schplitz</span>
        <span style={L.footerCopy}>Proudly built in Niederwalluf.</span>
      </footer>

    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const MONO = "'SF Mono','Cascadia Code','Consolas',monospace";
const SERIF = "Georgia,serif";
const SANS = "system-ui,-apple-system,sans-serif";

const L = {
  // Page
  page:           { background: "#09090d", color: "#fff", fontFamily: SERIF, minHeight: "100vh", overflowX: "hidden" },

  // Nav
  nav:            { position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", background: "rgba(9,9,13,0.88)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  logo:           { fontFamily: MONO, fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" },
  navCta:         { fontFamily: SANS, padding: "8px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 500, cursor: "pointer" },

  // Hero
  hero:           { display: "flex", alignItems: "stretch", minHeight: "100vh", flexWrap: "wrap" },
  heroLeft:       { flex: "1 1 500px", padding: "100px 64px 80px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 },
  heroRight:      { flex: "1 1 380px", position: "relative", minHeight: 500, overflow: "hidden" },
  heroImg:        { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%" },
  heroImgFade:    { position: "absolute", inset: 0, background: "linear-gradient(to right, #09090d 0%, transparent 40%)" },

  eyebrow:        { fontFamily: MONO, fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "3.5px", color: "#e8d44d", display: "block" },
  heroH1:         { fontFamily: SERIF, fontSize: "clamp(42px,5.5vw,72px)", fontWeight: 700, lineHeight: 1.04, color: "#fff", margin: 0, letterSpacing: "-3px" },
  accent:         { color: "#e8d44d" },
  heroP:          { fontFamily: SANS, fontSize: 16, lineHeight: 1.8, color: "rgba(255,255,255,0.45)", maxWidth: 420, margin: 0, fontWeight: 400 },

  // Terminal spec box
  termBox:        { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", maxWidth: 400 },
  termHeader:     { display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  termDot:        { width: 9, height: 9, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "inline-block" },
  termTitle:      { fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.25)", marginLeft: 4, letterSpacing: "0.5px" },
  termRow:        { display: "flex", alignItems: "baseline", gap: 10, padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  termKey:        { fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 80, flexShrink: 0 },
  termEq:         { fontFamily: MONO, fontSize: 11, color: "rgba(232,212,77,0.4)", flexShrink: 0 },
  termVal:        { fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.7)" },

  heroActs:       { display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" },
  heroCta:        { display: "inline-flex", alignItems: "center", gap: 10, background: "#e8d44d", border: "none", borderRadius: 9, color: "#09090d", padding: "14px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: SANS, letterSpacing: "-0.1px" },
  heroNote:       { fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.5px" },

  // Moment strip
  moments:        { display: "grid", gridTemplateColumns: "repeat(3,1fr)", height: 360 },
  moment:         { position: "relative", overflow: "hidden" },
  momentImg:      { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.6s ease" },
  momentOverlay:  { position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(9,9,13,0.85) 0%, rgba(9,9,13,0.1) 50%, transparent 100%)" },
  momentMeta:     { position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" },
  momentLabel:    { fontFamily: SANS, fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 400 },
  momentAmt:      { fontFamily: MONO, fontSize: 13, color: "#e8d44d", fontWeight: 600, letterSpacing: "-0.3px" },

  // Sections
  section:        { maxWidth: 1100, margin: "0 auto", padding: "120px 64px" },
  sectionHead:    { marginBottom: 64 },
  sectionH2:      { fontFamily: SERIF, fontSize: "clamp(34px,5vw,54px)", fontWeight: 700, lineHeight: 1.1, color: "#fff", margin: "14px 0 0", letterSpacing: "-2.5px" },

  // Problem cards
  problemGrid:    { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 1, background: "rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" },
  probCard:       { background: "#09090d", overflow: "hidden", display: "flex", flexDirection: "column" },
  probImgWrap:    { overflow: "hidden", height: 220 },
  probImg:        { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  probText:       { padding: "24px 28px 32px", flex: 1 },
  probTitle:      { fontFamily: SANS, fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 10px", letterSpacing: "-0.2px" },
  probBody:       { fontFamily: SANS, fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.35)", margin: 0 },

  // Photo break
  photoBreak:     { position: "relative", height: 520, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  photoBreakImg:  { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" },
  photoBreakDim:  { position: "absolute", inset: 0, background: "rgba(9,9,13,0.65)" },
  photoBreakContent:{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 680, padding: "0 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  quoteLine:      { width: 36, height: 2, background: "#e8d44d", borderRadius: 1 },
  quoteText:      { fontFamily: SERIF, fontSize: "clamp(20px,3.5vw,32px)", fontWeight: 400, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, margin: 0, letterSpacing: "-0.5px" },
  quoteAttr:      { fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.5px" },

  // Steps
  steps:          { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" },
  step:           { display: "flex", gap: 36, padding: "32px 36px", borderBottom: "1px solid rgba(255,255,255,0.05)", alignItems: "flex-start" },
  stepNum:        { fontFamily: MONO, fontSize: 12, color: "rgba(232,212,77,0.5)", flexShrink: 0, marginTop: 3, letterSpacing: "1px", minWidth: 24 },
  stepBody:       { flex: 1 },
  stepTitle:      { fontFamily: SANS, fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.2px" },
  stepDesc:       { fontFamily: SANS, fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.38)", margin: 0 },

  // Spec panel
  specPanel:      { display: "flex", flexWrap: "wrap", minHeight: 600 },
  specImgWrap:    { flex: "1 1 400px", position: "relative", minHeight: 400 },
  specImg:        { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 55%" },
  specContent:    { flex: "1 1 400px", padding: "80px 64px", background: "#0d0d12", display: "flex", flexDirection: "column", gap: 28, justifyContent: "center" },
  specH2:         { fontFamily: SERIF, fontSize: "clamp(30px,4vw,46px)", fontWeight: 700, lineHeight: 1.1, color: "#fff", margin: "12px 0 0", letterSpacing: "-2px" },
  specP:          { fontFamily: SANS, fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.38)", margin: 0 },
  specTable:      { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" },
  specRow:        { display: "flex", padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", gap: 20, alignItems: "center" },
  specKey:        { fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.28)", width: 88, flexShrink: 0 },
  specVal:        { fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.72)" },

  // CTA
  ctaSection:     { position: "relative", overflow: "hidden", padding: "160px 64px", textAlign: "center" },
  ctaBgImg:       { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" },
  ctaDim:         { position: "absolute", inset: 0, background: "rgba(9,9,13,0.82)" },
  ctaInner:       { position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 },
  ctaH2:          { fontFamily: SERIF, fontSize: "clamp(38px,6vw,62px)", fontWeight: 700, lineHeight: 1.07, letterSpacing: "-3px", margin: 0 },
  ctaP:           { fontFamily: SANS, fontSize: 15, color: "rgba(255,255,255,0.4)", margin: 0 },

  // Footer
  footer:         { padding: "36px 64px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 },
  footerLogo:     { fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.22)" },
  footerCopy:     { fontFamily: SANS, fontSize: 12, color: "rgba(255,255,255,0.18)" },
};
