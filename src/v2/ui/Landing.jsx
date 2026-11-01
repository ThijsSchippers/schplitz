// The Schplitz 2 landing page. Purple and blue colour blocks, very rounded images and cards,
// and springy motion: sections rise in as they scroll into view, the page colour shifts
// between sections, cards float and fan out. Everything is CSS plus one IntersectionObserver;
// motion stops when the visitor has asked for reduced motion.
//
// The message leads with the original promise: your payment data is yours, and yours alone.
import { Fragment, useEffect, useRef } from "react";
import { ICON_PATHS } from "./icons.js";

// Text pairs checked for WCAG AA (4.5:1):
//   ink on paper 11.5, ice 10.3, sky 9.0, lavender 9.1, purple 5.0, periwinkle 5.1, butter 11.4
//   cream on navy 13.7, on deep blue 5.6; muted on paper 5.4; mist on navy ≥ 9
// Bright blue (#4A87F2) is decoration only: no text sits on it.
const CSS = `
.ld { --paper:#FDFCFE; --ice:#E6F0FF; --sky:#CFE3FF; --lav:#E2DFFE; --purple:#AB9FF2; --peri:#8FA8F5; --blue:#4A87F2;
  --deep:#2F5FD0; --navy:#1B2A55; --ink:#3C315B; --cream:#FFFDF8; --butter:#FFFFC4; --mist:#D6E2FF; --muted:#5F5688;
  --spring:cubic-bezier(.34,1.56,.64,1); --ease:cubic-bezier(.2,.8,.2,1);
  font-family: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink); background: var(--paper); transition: background-color .7s var(--ease), color .7s var(--ease); min-height: 100vh; }
.ld[data-tone="ice"] { background: var(--ice); }
.ld[data-tone="sky"] { background: var(--sky); }
.ld[data-tone="lav"] { background: var(--lav); }
.ld[data-tone="navy"] { background: var(--navy); color: var(--cream); }
.ld[data-tone="purple"] { background: var(--purple); }
.ld * { box-sizing: border-box; }
.ld a { color: inherit; }

/* nav: logo, a floating white pill, and the main button */
.ld-nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px clamp(16px, 4vw, 40px); }
.ld-logo { font-weight: 800; font-size: 20px; letter-spacing: -.4px; display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; }
.ld-logo i { width: 28px; height: 28px; border-radius: 9px; background: linear-gradient(135deg, var(--purple), var(--peri)); color: var(--ink); display: grid; place-items: center; font-style: normal; font-size: 16px; }
.ld-pill { display: flex; gap: 4px; padding: 6px; border-radius: 100px; background: rgba(255,255,255,.92); box-shadow: 0 2px 20px rgba(27,42,85,.1); }
.ld-pill a { padding: 8px 14px; border-radius: 100px; font-size: 14px; font-weight: 600; text-decoration: none; color: var(--ink); }
.ld-pill a:hover { background: var(--ice); }
.ld-btn { border: 0; cursor: pointer; font: inherit; font-weight: 700; font-size: 15px; border-radius: 100px; padding: 12px 20px;
  background: var(--purple); color: var(--ink); display: inline-flex; align-items: center; gap: 8px; transition: transform .35s var(--spring), background .2s; text-decoration: none; }
.ld-btn:hover { transform: scale(1.04); }
.ld-btn:active { transform: scale(.97); }
.ld-btn.cream { background: var(--cream); }
.ld-btn.deep { background: var(--deep); color: var(--cream); }
.ld-btn.big { font-size: 17px; padding: 16px 28px; }
.ld-btn svg { width: 20px; height: 20px; }
.ld-btn:focus-visible, .ld-pill a:focus-visible, .ld-cards:focus-visible, .ld-footer a:focus-visible { outline: 3px solid var(--deep); outline-offset: 3px; }
.ld[data-tone="navy"] .ld-btn:focus-visible { outline-color: var(--butter); }
/* the nav button stays visible on every section colour */
.ld[data-tone="purple"] .ld-nav > .ld-btn, .ld[data-tone="lav"] .ld-nav > .ld-btn { background: var(--deep); color: var(--cream); }

/* hero: a big rounded photo panel with the promise on it */
.ld-hero { margin: 0 clamp(12px, 3vw, 32px); border-radius: 32px; overflow: hidden; position: relative; min-height: min(86vh, 760px);
  display: grid; place-items: center; text-align: center; color: var(--cream); isolation: isolate; }
.ld-hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; transform: scale(1.06); animation: ld-settle 1.6s var(--ease) forwards; }
.ld-hero::after { content: ""; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(160deg, rgba(60,49,91,.55) 0%, rgba(27,42,85,.78) 60%, rgba(47,95,208,.7) 100%); }
.ld-hero-in { padding: 96px 20px 210px; max-width: 920px; }
.ld-eyebrow { font-size: 14px; font-weight: 600; opacity: .9; display: inline-flex; align-items: center; gap: 6px; }
.ld-eyebrow svg { width: 16px; height: 16px; }
.ld-h1 { font-size: clamp(40px, 7vw, 84px); line-height: 1.02; letter-spacing: -.03em; font-weight: 700; margin: 14px 0 18px; }
.ld-h1 em { font-style: normal; color: var(--mist); }
.ld-lead { font-size: clamp(17px, 2vw, 21px); line-height: 1.45; max-width: 620px; margin: 0 auto 28px; opacity: .95; }

/* floating cards over the hero photo */
.ld-float { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); display: flex; gap: 14px; align-items: flex-end; pointer-events: none; }
.ld-mock { background: var(--navy); color: var(--cream); border-radius: 24px; padding: 18px 20px; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,.35); width: 300px; animation: ld-bob 6s ease-in-out infinite -1s; }
.ld-mock b { display: block; font-size: 22px; letter-spacing: -.02em; margin-bottom: 4px; }
.ld-mock span { font-size: 14px; color: var(--mist); }
.ld-chipcard { background: var(--cream); color: var(--ink); border-radius: 20px; padding: 12px 14px; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px;
  box-shadow: 0 14px 40px rgba(0,0,0,.25); animation: ld-bob 6s ease-in-out infinite; }
.ld-chipcard svg { width: 18px; height: 18px; color: var(--deep); }
.ld-chipcard:nth-child(1) { animation-delay: -2s; }
.ld-chipcard:nth-child(3) { animation-delay: -4s; }

/* big centred statements with a rounded picture or icon inside the sentence */
.ld-statement { text-align: center; padding: clamp(80px, 13vw, 150px) 20px; }
.ld-h2 { font-size: clamp(34px, 5.6vw, 68px); line-height: 1.08; letter-spacing: -.03em; font-weight: 700; margin: 0 auto 22px; max-width: 1000px; }
.ld-inline { display: inline-grid; place-items: center; vertical-align: middle; width: 1.25em; height: .95em; border-radius: .32em; margin: 0 .12em; overflow: hidden;
  background: var(--peri); color: var(--ink); transform: rotate(-6deg); }
.ld-inline img { width: 100%; height: 100%; object-fit: cover; }
.ld-inline svg { width: .62em; height: .62em; }
.ld-inline.butter { background: var(--butter); }
.ld-inline.sky { background: var(--sky); color: var(--deep); transform: rotate(5deg); }
.ld-sub { font-size: 18px; line-height: 1.5; max-width: 580px; margin: 0 auto; color: var(--muted); }
.ld[data-tone="navy"] .ld-sub { color: var(--mist); }
.ld[data-tone="lav"] .ld-sub, .ld[data-tone="ice"] .ld-sub, .ld[data-tone="sky"] .ld-sub { color: #4A4170; }

/* "most apps keep a copy": rounded photo cards with the problem on them */
.ld-problems { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; max-width: 1100px; margin: 48px auto 0; padding: 0 clamp(16px, 4vw, 40px); }
.ld-problem { display: flex; flex-direction: column; border-radius: 32px; overflow: hidden; background: var(--cream); color: var(--cream); text-align: left; box-shadow: 0 14px 36px rgba(27,42,85,.12); }
.ld-problem-pic { position: relative; aspect-ratio: 4 / 4.2; overflow: hidden; }
.ld-problem small { display: block; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--mist); margin-bottom: 6px; }
.ld-instead { margin: 0; flex: 1; display: flex; gap: 10px; align-items: flex-start; padding: 18px 22px 22px; color: var(--ink); font-size: 15px; line-height: 1.45; }
.ld-instead b { color: var(--deep); }
.ld-instead svg { width: 22px; height: 22px; flex-shrink: 0; padding: 3px; border-radius: 50%; background: var(--deep); color: var(--cream); }
.ld-problem img { width: 100%; height: 100%; object-fit: cover; filter: saturate(.8); transition: transform .8s var(--ease); }
.ld-problem:hover img { transform: scale(1.04); }
.ld-problem-pic > div { position: absolute; inset: auto 0 0 0; padding: 24px; background: linear-gradient(transparent, rgba(27,42,85,.92) 55%); }
.ld-problem-pic h3 { margin: 0 0 6px; font-size: 22px; letter-spacing: -.02em; }
.ld-problem-pic p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--mist); }
.ld-answer { margin: 56px auto 0; display: inline-flex; align-items: center; gap: 10px; padding: 14px 24px; border-radius: 100px; background: var(--navy); color: var(--cream); font-size: 18px; font-weight: 700; }
.ld-answer svg { width: 22px; height: 22px; color: var(--mist); }

/* privacy: pastel cards that fan out when they scroll into view */
.ld-stack { display: grid; grid-template-columns: repeat(4, minmax(0, 220px)); justify-content: center; margin: 56px auto 0; padding: 0 16px; }
.ld-stack div { min-height: 236px; border-radius: 24px; padding: 22px; color: var(--ink); text-align: left; font-size: 19px; font-weight: 700; line-height: 1.25;
  box-shadow: 0 18px 40px rgba(0,0,0,.28); display: flex; flex-direction: column; gap: 10px;
  opacity: 0; transform: translateY(60px) rotate(0deg); transition: transform 1s var(--spring), opacity .6s var(--ease); }
.ld-stack div svg { width: 28px; height: 28px; color: var(--deep); margin-bottom: auto; }
.ld-stack div + div { margin-left: -18px; }
.ld-stack div small { font-size: 15px; font-weight: 500; line-height: 1.45; color: #4A4170; }
.ld-stack div:nth-child(1) { background: var(--sky); }
.ld-stack div:nth-child(2) { background: var(--lav); transition-delay: .08s; }
.ld-stack div:nth-child(3) { background: var(--butter); transition-delay: .16s; }
.ld-stack div:nth-child(4) { background: var(--cream); transition-delay: .24s; }
.ld-stack.in div { opacity: 1; }
.ld-stack.in div:nth-child(1) { transform: translateY(18px) rotate(-8deg); }
.ld-stack.in div:nth-child(2) { transform: translateY(2px) rotate(-3deg); }
.ld-stack.in div:nth-child(3) { transform: translateY(2px) rotate(3deg); }
.ld-stack.in div:nth-child(4) { transform: translateY(18px) rotate(8deg); }

/* a row of tall rounded cards you can scroll sideways */
.ld-cards { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 8px clamp(16px, 4vw, 40px) 32px; scrollbar-width: none; }
.ld-cards::-webkit-scrollbar { display: none; }
.ld-card { flex: 0 0 clamp(260px, 30vw, 360px); height: clamp(380px, 44vw, 480px); border-radius: 32px; padding: 26px; scroll-snap-align: start; position: relative; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between; transition: transform .45s var(--spring); }
.ld-card:hover { transform: translateY(-6px) rotate(-.6deg); }
.ld-card h3 { font-size: 23px; line-height: 1.2; letter-spacing: -.02em; margin: 0; font-weight: 700; }
.ld-card p { margin: 10px 0 0; font-size: 15px; line-height: 1.45; }
.ld-card.purple { background: var(--purple); color: var(--ink); }
.ld-card.navy { background: var(--navy); color: var(--cream); }
.ld-card.navy p { color: var(--mist); }
.ld-card.peri { background: var(--peri); color: var(--ink); }
.ld-card.butter { background: var(--butter); color: var(--ink); }
.ld-card.sky { background: var(--sky); color: var(--ink); }
.ld-card.photo { color: var(--cream); padding: 0; }
.ld-card.photo img { width: 100%; height: 100%; object-fit: cover; }
.ld-card.photo div { position: absolute; inset: auto 0 0 0; padding: 26px; background: linear-gradient(transparent, rgba(27,42,85,.88) 45%); }
.ld-card.photo p { color: var(--mist); }
.ld-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ld-tiles span { aspect-ratio: 1; border-radius: 16px; background: rgba(255,255,255,.55); display: grid; place-items: center; }
.ld-tiles span.on { background: var(--navy); color: var(--mist); }
.ld-tiles svg { width: 26px; height: 26px; }
.ld-bubble { background: var(--cream); color: var(--ink); border-radius: 20px; padding: 14px 16px; font-size: 15px; font-weight: 600; }
.ld-bubble + .ld-bubble { margin-top: 8px; margin-left: 28px; background: var(--sky); }
.ld-big { font-size: 64px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
.ld-people { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 28px; }
.ld-people span { padding: 8px 14px; border-radius: 100px; background: rgba(27,42,85,.1); font-size: 14px; font-weight: 600; }
.ld-people span.on { background: var(--deep); color: var(--cream); }
.ld-cardnav { display: flex; justify-content: center; gap: 8px; }
.ld-cardnav button { width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--navy); color: var(--cream); cursor: pointer; font-size: 18px; transition: transform .3s var(--spring); }
.ld-cardnav button:hover { transform: scale(1.08); }
.ld-cardnav button:focus-visible { outline: 3px solid var(--deep); outline-offset: 3px; }

/* a ribbon of what people pay for */
.ld-ribbon { overflow: hidden; padding: 20px 0; }
.ld-ribbon-track { display: flex; gap: 12px; width: max-content; animation: ld-slide 40s linear infinite; }
.ld-ribbon span { display: inline-flex; align-items: center; gap: 8px; padding: 12px 18px; border-radius: 100px; background: var(--ice); color: var(--ink); font-weight: 600; font-size: 16px; white-space: nowrap; }
.ld-ribbon span:nth-child(3n+2) { background: var(--lav); }
.ld-ribbon span:nth-child(3n) { background: var(--sky); }
.ld-ribbon svg { width: 20px; height: 20px; }

/* the technical facts, for people who want to check */
.ld-spec { max-width: 760px; margin: 44px auto 0; border-radius: 32px; background: var(--cream); color: var(--ink); padding: clamp(20px, 4vw, 36px); text-align: left; }
.ld-spec dl { display: grid; grid-template-columns: max-content 1fr; gap: 0; margin: 0; }
.ld-spec dt, .ld-spec dd { margin: 0; padding: 13px 0; border-top: 1px solid rgba(60,49,91,.12); font-size: 15px; }
.ld-spec dt { padding-right: 28px; font-weight: 700; }
.ld-spec dd { color: #4A4170; }
.ld-spec dt:first-of-type, .ld-spec dd:first-of-type { border-top: 0; }
.ld-spec p { margin: 18px 0 0; font-size: 14px; line-height: 1.5; color: var(--muted); }
.ld-spec .ld-tech { margin-top: 8px; font-size: 13px; }
.ld-spec .ld-tech a { color: inherit; }

.ld-final { margin: 0 clamp(12px, 3vw, 32px); border-radius: 32px; padding: clamp(64px, 10vw, 120px) 20px; text-align: center; color: var(--cream);
  background: linear-gradient(135deg, var(--navy) 0%, #2B2F7A 55%, var(--deep) 100%); }
.ld-final .ld-sub { color: var(--mist); margin-bottom: 30px; }
.ld-v1 { max-width: 640px; margin: 0 auto; border-radius: 24px; background: var(--cream); color: var(--ink); padding: 24px 26px; display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.ld-v1 p { margin: 0; font-size: 16px; line-height: 1.45; flex: 1 1 280px; }
.ld-footer { margin: 24px clamp(12px, 3vw, 32px) 0; border-radius: 32px 32px 0 0; background: var(--cream); color: var(--ink); padding: 28px clamp(20px, 4vw, 40px);
  display: flex; gap: 16px; justify-content: space-between; align-items: center; flex-wrap: wrap; font-size: 14px; }
.ld-footer nav { display: flex; gap: 18px; flex-wrap: wrap; }

/* entrance and scroll motion */
[data-reveal] { opacity: 0; transform: translateY(28px) scale(.98); transition: opacity .8s var(--ease), transform .9s var(--spring); }
[data-reveal].in { opacity: 1; transform: none; }
.ld-inline[data-reveal] { transform: rotate(-30deg) scale(.4); }
.ld-inline[data-reveal].in { transform: rotate(-6deg) scale(1); }
.ld-inline.sky[data-reveal].in { transform: rotate(5deg) scale(1); }
.ld-problem[data-reveal]:nth-child(2) { transition-delay: .1s; }
.ld-problem[data-reveal]:nth-child(3) { transition-delay: .2s; }
@keyframes ld-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes ld-settle { to { transform: scale(1); } }
@keyframes ld-slide { to { transform: translateX(-50%); } }

@media (max-width: 760px) {
  .ld-pill { display: none; }
  .ld-hero-in { padding: 72px 18px 236px; }
  .ld-float { gap: 8px; width: calc(100% - 24px); justify-content: center; }
  .ld-float .ld-chipcard { display: none; }
  .ld-float .ld-chipcard.keep { display: flex; position: absolute; top: -52px; right: 6px; }
  .ld-mock { width: min(300px, 100%); }
  .ld-problems { grid-template-columns: 1fr; max-width: 420px; }
  .ld-problem-pic { aspect-ratio: 4 / 3; }
  .ld-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; max-width: 420px; }
  .ld-stack div + div { margin-left: 0; }
  .ld-stack div { min-height: 196px; font-size: 17px; padding: 18px; }
  .ld-stack div small { font-size: 14px; }
  .ld-stack.in div:nth-child(1) { transform: rotate(-3deg); }
  .ld-stack.in div:nth-child(2) { transform: translateY(10px) rotate(2deg); }
  .ld-stack.in div:nth-child(3) { transform: rotate(2deg); }
  .ld-stack.in div:nth-child(4) { transform: translateY(10px) rotate(-3deg); }
  .ld-spec dl { grid-template-columns: 1fr; }
  .ld-spec dt { padding-bottom: 0; }
  .ld-spec dd { border-top: 0; padding-top: 4px; }
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

const PROBLEMS = [
  // [photo, what other apps do, what that means, what Schplitz does instead]
  ["/v2/img/hiking.jpg", "Kept by the company", "Everything you add is saved on their computers, not yours.", "Stays on your phones and in your chat."],
  ["/v2/img/bar-friends.jpg", "Studied for profit", "What you spend, and where, says a lot about you. That's worth money to them.", "Nothing to study. No ads, no tracking."],
  ["/v2/img/beach-friends.jpg", "Passed on", "Advertisers and other companies can end up seeing it too.", "Nothing to pass on. Only your group can open the links."],
];

const SPEC = [
  ["Does Schplitz keep what I spend?", "No. It has nowhere to put it."],
  ["Do I need an account?", "No. Open the page and start."],
  ["Does Schplitz track me?", "No. No ads, no cookies, nothing that follows you around."],
  ["Who can open my links?", "Only people who know your group's answer."],
  ["Does Schplitz go online at all?", "Only to look up exchange rates, like euros to pounds."],
];

/**
 * Scroll motion: elements with data-reveal rise in once they're on screen, and sections
 * with data-tone set the page colour while they fill the middle of the screen.
 */
function useScrollMotion(root) {
  useEffect(() => {
    const page = root.current;
    if (!page || typeof IntersectionObserver !== "function") {
      page?.querySelectorAll("[data-reveal], .ld-stack").forEach(el => el.classList.add("in"));
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
          <a href="#private">Privacy</a>
          <a href="#how">How it works</a>
          <a href="#groups">Groups</a>
        </nav>
        <button type="button" className="ld-btn" onClick={() => onOpen("home")}>Open Schplitz</button>
      </header>

      <main id="top">
        <section className="ld-hero" aria-labelledby="ld-title">
          <img src="/v2/img/sunset-couple.jpg" alt="" />
          <div className="ld-hero-in">
            <p className="ld-eyebrow"><Svg name="lock" /> Splitting costs with friends, privately</p>
            <h1 className="ld-h1" id="ld-title">Your payment data is yours. <em>And yours alone.</em></h1>
            <p className="ld-lead">Schplitz keeps track of who's ahead between friends. No sign-up, and Schplitz stores nothing, so nobody else ever sees what you spend.</p>
            <button type="button" className="ld-btn cream big" onClick={() => onOpen("start")}>Start a tally</button>
          </div>
          <div className="ld-float" aria-hidden="true">
            <div className="ld-chipcard"><Svg name="person_cancel" /> No sign-up</div>
            <div className="ld-mock"><b>Next one's on Ben</b><span>Ben is about 2 rounds of drinks behind.</span></div>
            <div className="ld-chipcard keep"><Svg name="visibility_off" /> No ads</div>
          </div>
        </section>

        <section className="ld-statement" data-tone="ice" aria-labelledby="ld-problem">
          <h2 className="ld-h2" id="ld-problem" data-reveal>Most splitting apps keep<span className="ld-inline sky" data-reveal><Svg name="database_off" /></span> a copy of what you spend</h2>
          <p className="ld-sub" data-reveal>Every coffee, dinner and weekend away, saved by the company behind the app. Schplitz works the other way round.</p>
          <div className="ld-problems">
            {PROBLEMS.map(([src, title, body, instead]) => (
              <article className="ld-problem" key={title} data-reveal>
                <div className="ld-problem-pic">
                  <img src={src} alt="" loading="lazy" />
                  <div><small>Other apps</small><h3>{title}</h3><p>{body}</p></div>
                </div>
                <p className="ld-instead"><Svg name="check" /><span><b>Schplitz:</b> {instead}</span></p>
              </article>
            ))}
          </div>
          <p className="ld-answer" data-reveal><Svg name="shield_lock" /> Schplitz keeps nothing.</p>
        </section>

        <section className="ld-statement" data-tone="navy" id="private" aria-labelledby="ld-private">
          <h2 className="ld-h2" id="ld-private" data-reveal>Your chat is the record. <br />Schplitz never sees it.</h2>
          <p className="ld-sub" data-reveal>The tally travels in the links you send each other, locked with an answer only your group knows.</p>
          <div className="ld-stack" role="list" aria-label="How your data stays yours">
            <div role="listitem"><Svg name="person_cancel" />No account<small>Open the page and start. No email, no password.</small></div>
            <div role="listitem"><Svg name="lock" />Locked links<small>Locked on your phone before you send them. Only your group can open them.</small></div>
            <div role="listitem"><Svg name="key" />Your answer stays with you<small>It's the key to every link, and it never leaves your phone.</small></div>
            <div role="listitem"><Svg name="backup" />Lose your phone, keep your tally<small>Open the latest link from your chat and you're back.</small></div>
          </div>
        </section>

        <section className="ld-statement" data-tone="lav" id="how" aria-labelledby="ld-how">
          <h2 className="ld-h2" id="ld-how" data-reveal>
            Talk in coffees<span className="ld-inline butter" data-reveal><Svg name="local_cafe" /></span>, not euros
          </h2>
          <p className="ld-sub" data-reveal>You still enter what you paid. Schplitz just tells you whose turn it is, in things you actually buy each other.</p>
        </section>

        <section aria-label="What Schplitz does" data-tone="lav">
          <div className="ld-cards" ref={cards} tabIndex={0} aria-label="Features, scroll sideways">
            <article className="ld-card purple" data-reveal>
              <div><h3>Tap what you paid for</h3><p>Pick a tile and type the amount. The usual amount is already filled in.</p></div>
              <div className="ld-tiles" aria-hidden="true">
                {["local_cafe", "local_bar", "restaurant", "sports_tennis", "confirmation_number", "commute"].map((i, n) => <span key={i} className={n === 1 ? "on" : ""}><Svg name={i} /></span>)}
              </div>
            </article>
            <article className="ld-card navy" data-reveal>
              <div><h3>See whose turn it is</h3><p>No balances with cents on the main screen. Just who's up next, and roughly by how much.</p></div>
              <div aria-hidden="true">
                <div className="ld-bubble">Next one's on you</div>
                <div className="ld-bubble">You're about a coffee behind.</div>
              </div>
            </article>
            <article className="ld-card photo" data-reveal>
              <img src="/v2/img/coffee-chat.jpg" alt="Two friends talking over coffee" loading="lazy" />
              <div><h3>Send it in the chat</h3><p>Every update is a link. Your friends tap it and they're up to date.</p></div>
            </article>
            <article className="ld-card butter" data-reveal>
              <div><h3>“I wasn't there”</h3><p>Added to a dinner you skipped? Say so with one tap. The person who paid sees it and fixes it.</p></div>
              <div aria-hidden="true"><div className="ld-bubble">Dinner · €100</div><div className="ld-bubble">Not me</div></div>
            </article>
            <article className="ld-card sky" data-reveal>
              <div><h3>Exact numbers, one tap away</h3><p>Every amount, currency and date stays in Details, for when you want to check.</p></div>
              <p className="ld-big" aria-hidden="true">€24.30</p>
            </article>
          </div>
          <div className="ld-cardnav">
            <button type="button" aria-label="Previous" onClick={() => slide(-1)}>←</button>
            <button type="button" aria-label="Next" onClick={() => slide(1)}>→</button>
          </div>
        </section>

        <section className="ld-statement" data-tone="paper" id="groups" aria-labelledby="ld-groups">
          <h2 className="ld-h2" id="ld-groups" data-reveal>
            Works for two,<span className="ld-inline" data-reveal><img src="/v2/img/hiking.jpg" alt="" /></span> or the whole group
          </h2>
          <p className="ld-sub" data-reveal>Up to 10 people. Mark who's here tonight and Schplitz picks whose round it is among them. Missed the drinks? You're not in the split.</p>
          <div className="ld-people" data-reveal aria-hidden="true">
            {[["You", true], ["Ana", true], ["Ben", false], ["Cas", true], ["Dee", true]].map(([n, on]) => <span key={n} className={on ? "on" : ""}>{n}</span>)}
          </div>
        </section>

        <div className="ld-ribbon" aria-hidden="true" data-tone="paper">
          <div className="ld-ribbon-track">
            {[...RIBBON, ...RIBBON].map(([icon, text], i) => <span key={i}><Svg name={icon} />{text}</span>)}
          </div>
        </div>

        <section className="ld-statement" data-tone="sky" aria-labelledby="ld-spec">
          <h2 className="ld-h2" id="ld-spec" data-reveal>No small print</h2>
          <p className="ld-sub" data-reveal>Straight answers to what people ask.</p>
          <div className="ld-spec" data-reveal>
            <dl>{SPEC.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
            <p>For the technical crowd: For the technical crowd: AES-256-GCM, keys from PBKDF2-SHA256 with 600,000 rounds, and the <a href="https://github.com/thijsschippers/schplitz">code is open</a>.</p>
          </div>
        </section>

        <section className="ld-statement" data-tone="purple" style={{ paddingTop: 0 }} aria-label="Schplitz 1">
          <div className="ld-v1" data-reveal>
            <p><strong>Used Schplitz before?</strong> Your old tally comes along. Open Schplitz on the same phone, or tap an old link.</p>
            <button type="button" className="ld-btn deep" onClick={() => onOpen("home")}>Bring it in</button>
          </div>
        </section>

        <section className="ld-final" data-tone="purple" aria-labelledby="ld-final-title">
          <h2 className="ld-h2" id="ld-final-title" data-reveal>Start a tally<span className="ld-inline" data-reveal><img src="/v2/img/beach-friends.jpg" alt="" /></span> in a minute</h2>
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
