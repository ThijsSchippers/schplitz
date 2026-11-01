// The Schplitz 2 landing page. Soft lavender and pastel colour blocks, very rounded
// images and cards, and springy motion: sections rise in as they scroll into view, the
// page colour shifts between sections, cards float and fan out. Everything is CSS and one
// IntersectionObserver; motion stops when the visitor has asked for reduced motion.
import { useEffect, useRef } from "react";
import { ICON_PATHS } from "./icons.js";

// Text pairs checked for WCAG AA: ink on paper 11.5:1, on lavender 9.1:1, on purple 5.0:1,
// on butter 11.4:1; cream on ink 11.6:1; muted on paper ≥ 5.4:1 (on lavender it's darker).
const CSS = `
.ld { --paper:#FDFCFE; --lav:#E2DFFE; --purple:#AB9FF2; --ink:#3C315B; --cream:#FFFDF8; --butter:#FFFFC4; --night:#1C1C1C;
  --muted:#5F5688; --spring:cubic-bezier(.34,1.56,.64,1); --ease:cubic-bezier(.2,.8,.2,1);
  font-family: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink); background: var(--paper); transition: background-color .7s var(--ease), color .7s var(--ease); min-height: 100vh; }
.ld[data-tone="lav"] { background: var(--lav); }
.ld[data-tone="ink"] { background: var(--ink); color: var(--cream); }
.ld[data-tone="purple"] { background: var(--purple); }
.ld * { box-sizing: border-box; }
.ld a { color: inherit; }

/* nav: logo, a floating white pill, and the main button */
.ld-nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px clamp(16px, 4vw, 40px); }
.ld-logo { font-weight: 800; font-size: 20px; letter-spacing: -.4px; display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; }
.ld-logo i { width: 28px; height: 28px; border-radius: 9px; background: var(--butter); color: var(--ink); display: grid; place-items: center; font-style: normal; font-size: 16px; }
.ld-pill { display: flex; gap: 4px; padding: 6px; border-radius: 100px; background: rgba(255,255,255,.9); box-shadow: 0 2px 20px rgba(60,49,91,.08); }
.ld-pill a { padding: 8px 14px; border-radius: 100px; font-size: 14px; font-weight: 600; text-decoration: none; color: var(--ink); }
.ld-pill a:hover { background: var(--lav); }
.ld-btn { border: 0; cursor: pointer; font: inherit; font-weight: 700; font-size: 15px; border-radius: 100px; padding: 12px 20px;
  background: var(--purple); color: var(--ink); display: inline-flex; align-items: center; gap: 8px; transition: transform .35s var(--spring), background .2s; text-decoration: none; }
.ld-btn:hover { transform: scale(1.04); }
.ld-btn:active { transform: scale(.97); }
.ld-btn.cream { background: var(--cream); }
.ld-btn.ink { background: var(--ink); color: var(--cream); }
.ld-btn.big { font-size: 17px; padding: 16px 28px; }
.ld-btn:focus-visible, .ld-pill a:focus-visible, .ld-cards:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
.ld[data-tone="ink"] .ld-btn:focus-visible { outline-color: var(--butter); }
/* the nav button stays visible on every section colour */
.ld[data-tone="purple"] .ld-nav > .ld-btn { background: var(--ink); color: var(--cream); }

/* hero: a big rounded photo panel with the message on it */
.ld-hero { margin: 0 clamp(12px, 3vw, 32px); border-radius: 32px; overflow: hidden; position: relative; min-height: min(86vh, 760px);
  display: grid; place-items: center; text-align: center; color: var(--cream); isolation: isolate; }
.ld-hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; transform: scale(1.06); animation: ld-settle 1.6s var(--ease) forwards; }
.ld-hero::after { content: ""; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(28,22,48,.35), rgba(28,22,48,.72)); }
.ld-hero-in { padding: 96px 20px 200px; max-width: 900px; }
.ld-eyebrow { font-size: 14px; font-weight: 600; opacity: .85; }
.ld-h1 { font-size: clamp(40px, 7vw, 84px); line-height: 1.02; letter-spacing: -.03em; font-weight: 700; margin: 14px 0 18px; }
.ld-lead { font-size: clamp(17px, 2vw, 21px); line-height: 1.45; max-width: 600px; margin: 0 auto 28px; opacity: .92; }
.ld-note { font-size: 13px; opacity: .8; margin-top: 12px; }

/* floating app cards over the hero photo */
.ld-float { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); display: flex; gap: 14px; align-items: flex-end; pointer-events: none; }
.ld-mock { background: var(--ink); color: var(--cream); border-radius: 24px; padding: 18px 20px; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,.35); width: 290px; animation: ld-bob 6s ease-in-out infinite; }
.ld-mock b { display: block; font-size: 22px; letter-spacing: -.02em; margin-bottom: 4px; }
.ld-mock span { font-size: 14px; color: var(--lav); }
.ld-chipcard { background: var(--cream); color: var(--ink); border-radius: 20px; padding: 12px 14px; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px;
  box-shadow: 0 14px 40px rgba(0,0,0,.25); animation: ld-bob 6s ease-in-out infinite; }
.ld-chipcard:nth-child(1) { animation-delay: -2s; }
.ld-chipcard:nth-child(3) { animation-delay: -4s; }

/* big centred statements with a rounded picture inside the sentence */
.ld-statement { text-align: center; padding: clamp(80px, 14vw, 160px) 20px; }
.ld-h2 { font-size: clamp(34px, 5.6vw, 68px); line-height: 1.08; letter-spacing: -.03em; font-weight: 700; margin: 0 auto 22px; max-width: 980px; }
.ld-inline { display: inline-grid; place-items: center; vertical-align: middle; width: 1.25em; height: .95em; border-radius: .32em; margin: 0 .12em; overflow: hidden;
  background: var(--purple); color: var(--ink); transform: rotate(-6deg); }
.ld-inline img { width: 100%; height: 100%; object-fit: cover; }
.ld-inline svg { width: .62em; height: .62em; }
.ld-inline.butter { background: var(--butter); }
.ld-sub { font-size: 18px; line-height: 1.5; max-width: 560px; margin: 0 auto; color: var(--muted); }
.ld[data-tone="ink"] .ld-sub { color: var(--lav); }
.ld[data-tone="lav"] .ld-sub { color: #4E4575; }

/* a row of tall rounded cards you can scroll sideways */
.ld-cards { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 8px clamp(16px, 4vw, 40px) 32px; scrollbar-width: none; }
.ld-cards::-webkit-scrollbar { display: none; }
.ld-card { flex: 0 0 clamp(260px, 30vw, 360px); height: clamp(380px, 44vw, 480px); border-radius: 32px; padding: 26px; scroll-snap-align: start; position: relative; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between; transition: transform .45s var(--spring); }
.ld-card:hover { transform: translateY(-6px) rotate(-.6deg); }
.ld-card h3 { font-size: 23px; line-height: 1.2; letter-spacing: -.02em; margin: 0; font-weight: 700; }
.ld-card p { margin: 10px 0 0; font-size: 15px; line-height: 1.45; }
.ld-card.purple { background: var(--purple); color: var(--ink); }
.ld-card.night { background: var(--night); color: var(--cream); }
.ld-card.grey { background: #E9E8EA; color: var(--ink); }
.ld-card.butter { background: var(--butter); color: var(--ink); }
.ld-card.lav { background: var(--cream); color: var(--ink); }
.ld-card.photo { color: var(--cream); padding: 0; }
.ld-card.photo img { width: 100%; height: 100%; object-fit: cover; }
.ld-card.photo div { position: absolute; inset: auto 0 0 0; padding: 26px; background: linear-gradient(transparent, rgba(28,22,48,.8)); }
.ld-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ld-tiles span { aspect-ratio: 1; border-radius: 16px; background: rgba(255,255,255,.55); display: grid; place-items: center; }
.ld-tiles span.on { background: var(--ink); color: var(--butter); }
.ld-tiles svg { width: 26px; height: 26px; }
.ld-bubble { background: var(--cream); color: var(--ink); border-radius: 20px; padding: 14px 16px; font-size: 15px; font-weight: 600; }
.ld-bubble + .ld-bubble { margin-top: 8px; margin-left: 28px; background: var(--purple); }
.ld-people { display: flex; flex-wrap: wrap; gap: 6px; }
.ld-people span { padding: 8px 12px; border-radius: 100px; background: rgba(60,49,91,.1); font-size: 14px; font-weight: 600; }
.ld-people span.on { background: var(--ink); color: var(--cream); }
.ld-cardnav { display: flex; justify-content: center; gap: 8px; }
.ld-cardnav button { width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--ink); color: var(--cream); cursor: pointer; font-size: 18px; transition: transform .3s var(--spring); }
.ld-cardnav button:hover { transform: scale(1.08); }

/* privacy: pastel cards that fan out when they scroll into view */
.ld-stack { display: grid; grid-template-columns: repeat(4, minmax(0, 220px)); justify-content: center; gap: 0; margin: 56px auto 0; padding: 0 16px; }
.ld-stack div { min-height: 230px; border-radius: 24px; padding: 22px; color: var(--ink); text-align: left; font-size: 19px; font-weight: 700; line-height: 1.25;
  box-shadow: 0 18px 40px rgba(0,0,0,.25); display: flex; flex-direction: column; justify-content: space-between; gap: 12px;
  opacity: 0; transform: translateY(60px) rotate(0deg); transition: transform 1s var(--spring), opacity .6s var(--ease); }
.ld-stack div + div { margin-left: -18px; }
.ld-stack div small { font-size: 15px; font-weight: 500; line-height: 1.45; color: #4E4575; }
.ld-stack div:nth-child(1) { background: #FBD3E9; }
.ld-stack div:nth-child(2) { background: #CFF5E1; transition-delay: .08s; }
.ld-stack div:nth-child(3) { background: var(--butter); transition-delay: .16s; }
.ld-stack div:nth-child(4) { background: var(--cream); transition-delay: .24s; }
.ld-stack.in div { opacity: 1; }
.ld-stack.in div:nth-child(1) { transform: translateY(18px) rotate(-8deg); }
.ld-stack.in div:nth-child(2) { transform: translateY(2px) rotate(-3deg); }
.ld-stack.in div:nth-child(3) { transform: translateY(2px) rotate(3deg); }
.ld-stack.in div:nth-child(4) { transform: translateY(18px) rotate(8deg); }

/* a ribbon of what people pay for */
.ld-ribbon { overflow: hidden; padding: 20px 0; }
.ld-ribbon-track { display: flex; gap: 12px; width: max-content; animation: ld-slide 40s linear infinite; }
.ld-ribbon span { display: inline-flex; align-items: center; gap: 8px; padding: 12px 18px; border-radius: 100px; background: var(--cream); color: var(--ink); font-weight: 600; font-size: 16px; white-space: nowrap; }
.ld-ribbon svg { width: 20px; height: 20px; }

.ld-final { margin: 0 clamp(12px, 3vw, 32px); border-radius: 32px; padding: clamp(64px, 10vw, 120px) 20px; text-align: center; background: var(--ink); color: var(--cream); }
.ld-final .ld-h2 { color: var(--cream); }
.ld-final .ld-sub { color: var(--lav); margin-bottom: 30px; }
.ld-v1 { max-width: 640px; margin: 0 auto; border-radius: 24px; background: var(--cream); color: var(--ink); padding: 24px 26px; display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.ld-v1 p { margin: 0; font-size: 16px; line-height: 1.45; flex: 1 1 280px; }
.ld-footer { margin: 24px clamp(12px, 3vw, 32px) 24px; border-radius: 32px; background: var(--cream); color: var(--ink); padding: 28px clamp(20px, 4vw, 40px);
  display: flex; gap: 16px; justify-content: space-between; align-items: center; flex-wrap: wrap; font-size: 14px; }
.ld-footer nav { display: flex; gap: 18px; flex-wrap: wrap; }

/* entrance and scroll motion */
[data-reveal] { opacity: 0; transform: translateY(28px) scale(.98); transition: opacity .8s var(--ease), transform .9s var(--spring); }
[data-reveal].in { opacity: 1; transform: none; }
.ld-inline[data-reveal] { transform: rotate(-30deg) scale(.4); }
.ld-inline[data-reveal].in { transform: rotate(-6deg) scale(1); }
@keyframes ld-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
.ld-float .ld-mock { animation-delay: -1s; }
@keyframes ld-settle { to { transform: scale(1); } }
@keyframes ld-slide { to { transform: translateX(-50%); } }

@media (max-width: 760px) {
  .ld-pill { display: none; }
  .ld-hero-in { padding: 72px 18px 230px; }
  .ld-float { gap: 8px; width: calc(100% - 24px); justify-content: center; }
  .ld-float .ld-chipcard { display: none; }
  .ld-float .ld-chipcard.keep { display: flex; position: absolute; top: -52px; right: 6px; }
  .ld-mock { width: min(300px, 100%); }
  .ld-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; max-width: 420px; }
  .ld-stack div + div { margin-left: 0; }
  .ld-stack div { min-height: 190px; font-size: 17px; padding: 18px; }
  .ld-stack div small { font-size: 14px; }
  .ld-stack.in div:nth-child(1) { transform: rotate(-3deg); }
  .ld-stack.in div:nth-child(2) { transform: translateY(10px) rotate(2deg); }
  .ld-stack.in div:nth-child(3) { transform: rotate(2deg); }
  .ld-stack.in div:nth-child(4) { transform: translateY(10px) rotate(-3deg); }
}

@media (prefers-reduced-motion: reduce) {
  .ld, .ld * { animation: none !important; transition: none !important; }
  [data-reveal], .ld-inline[data-reveal], .ld-stack div { opacity: 1; transform: none; }
  .ld-inline[data-reveal] { transform: rotate(-6deg); }
}
`;

function Svg({ name }) {
  return <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false"><path d={ICON_PATHS[name]} /></svg>;
}

const RIBBON = [
  ["local_cafe", "A coffee"], ["local_bar", "A round of drinks"], ["sports_tennis", "A padel court"], ["restaurant", "Dinner"],
  ["confirmation_number", "Concert tickets"], ["local_gas_station", "Fuel for the road trip"], ["shopping_cart", "Groceries"],
  ["bed", "A night away"], ["commute", "A taxi home"], ["redeem", "A birthday gift"],
];

/**
 * Scroll motion: elements with data-reveal rise in once they're on screen, and sections
 * with data-tone set the page colour while they fill the middle of the screen.
 */
function useScrollMotion(root) {
  useEffect(() => {
    const page = root.current;
    if (!page || typeof IntersectionObserver !== "function") {
      page?.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("in"));
      return undefined;
    }
    const reveal = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); reveal.unobserve(e.target); }
    }, { threshold: 0.18 });
    page.querySelectorAll("[data-reveal], .ld-stack").forEach(el => reveal.observe(el));
    const tone = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) page.dataset.tone = e.target.dataset.tone;
    }, { rootMargin: "-45% 0px -45% 0px" });
    page.querySelectorAll("[data-tone]").forEach(el => { if (el !== page) tone.observe(el); });
    return () => { reveal.disconnect(); tone.disconnect(); };
  }, [root]);
}

/** onOpen("start" | "home"): leave the landing page for the start screen or the app's home. */
export default function Landing({ onOpen }) {
  const root = useRef(null);
  const cards = useRef(null);
  useScrollMotion(root);
  const slide = (dir) => cards.current?.scrollBy({ left: dir * Math.min(380, cards.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="ld" ref={root} data-tone="paper">
      <style>{CSS}</style>

      <header className="ld-nav">
        <a className="ld-logo" href="#top" aria-label="Schplitz, back to the top"><i aria-hidden="true">S</i>Schplitz</a>
        <nav className="ld-pill" aria-label="On this page">
          <a href="#how">How it works</a>
          <a href="#groups">Groups</a>
          <a href="#private">Privacy</a>
        </nav>
        <button type="button" className="ld-btn" onClick={() => onOpen("home")}>Open Schplitz</button>
      </header>

      <main id="top">
        <section className="ld-hero" aria-labelledby="ld-title">
          <img src="/v2/img/bar-friends.jpg" alt="" />
          <div className="ld-hero-in">
            <p className="ld-eyebrow">For friends who take turns</p>
            <h1 className="ld-h1" id="ld-title">Who's buying the next round?</h1>
            <p className="ld-lead">Schplitz keeps track of who's ahead between friends, so nobody has to do the maths or ask the awkward question.</p>
            <button type="button" className="ld-btn cream big" onClick={() => onOpen("start")}>Start a tally</button>
            <p className="ld-note">Free. No account, nothing to install.</p>
          </div>
          <div className="ld-float" aria-hidden="true">
            <div className="ld-chipcard"><Svg name="local_cafe" /> Coffee</div>
            <div className="ld-mock"><b>Next one's on Ben</b><span>Ben is about 2 rounds of drinks behind.</span></div>
            <div className="ld-chipcard keep"><Svg name="sports_tennis" /> Padel</div>
          </div>
        </section>

        <section className="ld-statement" data-tone="lav" id="how">
          <h2 className="ld-h2" data-reveal>
            Talk in coffees<span className="ld-inline butter" data-reveal><Svg name="local_cafe" /></span>, not euros
          </h2>
          <p className="ld-sub" data-reveal>You still enter what you paid. Schplitz just tells you whose turn it is in things you actually buy each other.</p>
        </section>

        <section aria-label="What Schplitz does" data-tone="lav">
          <div className="ld-cards" ref={cards} tabIndex={0} aria-label="Features, scroll sideways">
            <article className="ld-card purple" data-reveal>
              <div><h3>Tap what you paid for</h3><p>Pick a tile, type the amount, done. The usual amount is already filled in.</p></div>
              <div className="ld-tiles" aria-hidden="true">
                {["local_cafe", "local_bar", "restaurant", "sports_tennis", "confirmation_number", "commute"].map((i, n) => <span key={i} className={n === 1 ? "on" : ""}><Svg name={i} /></span>)}
              </div>
            </article>
            <article className="ld-card night" data-reveal>
              <div><h3>See whose turn it is</h3><p>No balances with cents on the main screen. Just who's up next, and roughly by how much.</p></div>
              <div aria-hidden="true">
                <div className="ld-bubble">Next one's on you</div>
                <div className="ld-bubble">You're about a coffee behind.</div>
              </div>
            </article>
            <article className="ld-card photo" data-reveal>
              <img src="/v2/img/beach-friends.jpg" alt="Friends on a beach" />
              <div><h3>Send it in the chat</h3><p>Every update is a link. Your friends tap it and they're up to date.</p></div>
            </article>
            <article className="ld-card butter" data-reveal>
              <div><h3>“I wasn't there”</h3><p>Got added to a dinner you skipped? Say so with one tap. The payer sees it and fixes it.</p></div>
              <div aria-hidden="true"><div className="ld-bubble">Dinner · €100</div><div className="ld-bubble">Not me</div></div>
            </article>
            <article className="ld-card grey" data-reveal>
              <div><h3>Exact numbers, one tap away</h3><p>Every amount, currency and date stays in Details, for the times you want to check.</p></div>
            </article>
          </div>
          <div className="ld-cardnav">
            <button type="button" aria-label="Previous" onClick={() => slide(-1)}>←</button>
            <button type="button" aria-label="Next" onClick={() => slide(1)}>→</button>
          </div>
        </section>

        <section className="ld-statement" data-tone="paper" id="groups">
          <h2 className="ld-h2" data-reveal>
            Works for two,<span className="ld-inline" data-reveal><img src="/v2/img/hiking.jpg" alt="" /></span> or the whole group
          </h2>
          <p className="ld-sub" data-reveal>Up to 10 people. Mark who's here tonight and Schplitz picks whose round it is among them. Missed the drinks? You're not in the split.</p>
          <div className="ld-people" data-reveal style={{ justifyContent: "center", marginTop: 28 }} aria-hidden="true">
            {[["You", true], ["Ana", true], ["Ben", false], ["Cas", true], ["Dee", true]].map(([n, on]) => <span key={n} className={on ? "on" : ""}>{n}</span>)}
          </div>
        </section>

        <div className="ld-ribbon" aria-hidden="true" data-tone="paper">
          <div className="ld-ribbon-track">
            {[...RIBBON, ...RIBBON].map(([icon, text], i) => <span key={i}><Svg name={icon} />{text}</span>)}
          </div>
        </div>

        <section className="ld-statement" data-tone="ink" id="private">
          <h2 className="ld-h2" data-reveal>Your chat is the record. <br />We never see it.</h2>
          <p className="ld-sub" data-reveal>There's no server and no database. The balance travels inside the links you send, encrypted with an answer only your group knows.</p>
          <div className="ld-stack" aria-label="How your data is kept private" role="list">
            <div role="listitem">No account<small>Open the page and start. Nothing to sign up for.</small></div>
            <div role="listitem">Encrypted links<small>AES-256 in your browser, before anything leaves your phone.</small></div>
            <div role="listitem">Your answer stays with you<small>It's the key to every link. We never see it.</small></div>
            <div role="listitem">Lose your phone, keep your tally<small>Open the latest link from your chat and you're back.</small></div>
          </div>
        </section>

        <section className="ld-statement" data-tone="purple" style={{ paddingTop: 0 }}>
          <div className="ld-v1" data-reveal>
            <p><strong>Used Schplitz before?</strong> Your old tally comes along. Open Schplitz on the same phone, or tap an old link.</p>
            <button type="button" className="ld-btn ink" onClick={() => onOpen("home")}>Bring it in</button>
          </div>
        </section>

        <section className="ld-final" data-tone="purple" aria-labelledby="ld-final-title">
          <h2 className="ld-h2" id="ld-final-title" data-reveal>Start a tally<span className="ld-inline" data-reveal><img src="/v2/img/sunset-couple.jpg" alt="" /></span> in a minute</h2>
          <p className="ld-sub" data-reveal>Pick a question only your friends can answer, send the link, and get back to the fun part.</p>
          <button type="button" className="ld-btn big" onClick={() => onOpen("start")} data-reveal>Start a tally</button>
        </section>
      </main>

      <footer className="ld-footer">
        <strong>Schplitz</strong>
        <nav aria-label="Footer">
          <a href="#private">Privacy</a>
          <a href="/classic/">Schplitz 1</a>
          <a href="https://github.com/thijsschippers/schplitz">Source code</a>
        </nav>
        <span>Proudly built in Niederwalluf.</span>
      </footer>
    </div>
  );
}
