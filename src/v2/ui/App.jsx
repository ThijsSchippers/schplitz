// Schplitz 2 — the app: which screen is showing, and what each action does.
//
// The open tally is one object that tally.js mutates in place; after each change it's
// saved to the cache and the screen re-renders. Screens get it as a prop and read it.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { openCache, requestPersistence } from "../cache.js";
import {
  save, startTally, openLink, unlockLink, completeJoin, recordPayment, markShared, v1Status, convertDeviceV1, valueInTallyCurrency,
} from "../app.js";
import { editPayment, voidPayment, notMe, askAbout, acceptDispute, keepAsIs, addPaidBack, setFreshStart, recategorize, paymentState } from "../tally.js";
import { defaultRate } from "../migrate.js";
import { errorText, hero, nameOf } from "./format.js";
import { Toast } from "./components.jsx";
import { Home, Start, Join, ConvertV1 } from "./Onboarding.jsx";
import TallyView from "./TallyView.jsx";
import LogPayment from "./LogPayment.jsx";
import Details from "./Details.jsx";
import { ShareSheet, Review, SortOld } from "./Sheets.jsx";
import { S } from "./theme.js";

const TOAST_MS = 3200;

const MESSAGES = {
  notMe: "I wasn't part of one of the payments — have a look",
  question: "I have a question about one of the payments — have a look",
  fresh: "I started our tally fresh from here — have a look",
};

/** Links point back at wherever this app is served (e.g. /v2/ during the preview). */
const linkOrigin = () => `${location.origin}${location.pathname.replace(/\/[^/]*$/, "")}`;

/** Takes a `#s=` link out of the address bar (so reloading doesn't open it again) and returns it. */
function takeLinkFromAddressBar() {
  if (!location.hash.startsWith("#s=")) return null;
  const url = location.href;
  history.replaceState(null, "", location.pathname + location.search);
  return url;
}

/** A review sheet is worth showing when something needs a look; otherwise a toast is enough. */
const needsReview = (report) =>
  report.involvingMe.length > 0 || report.replaced.length > 0 || report.conflicts.length > 0 || report.review.some(r => r.theyMiss.length > 0);

export default function App({ rateFor = defaultRate, cacheName }) {
  const [cache, setCache] = useState(null);
  const [tallies, setTallies] = useState([]);
  const [v1, setV1] = useState(null);
  const [view, setView] = useState({ name: "loading" });
  const [current, setCurrent] = useState(null);           // { tally, key }: the open tally
  const [, rerender] = useReducer(x => x + 1, 0);
  const [toast, setToast] = useState(null);
  const [sheet, setSheet] = useState(null);               // { kind: "share" | "review" | "sort", ... }
  const toastTimer = useRef();
  const currentRef = useRef(null);
  currentRef.current = current;

  const flash = useCallback((text, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const refresh = useCallback(async (c) => {
    setTallies(await c.listTallies());
    setV1(await v1Status(c).catch(() => null));
  }, []);

  const showTally = useCallback((tally, key, nextSheet = null) => {
    setCurrent({ tally, key });
    setSheet(nextSheet);
    setView({ name: "tally" });
  }, []);

  const handleLink = useCallback(async (c, url) => {
    try {
      const r = await openLink(c, url);
      if (r.kind === "join") { setCurrent(null); setSheet(null); setView({ name: "join", url, header: r.header }); return; }
      const { report, tally } = r;
      showTally(tally, r.key, needsReview(report) ? { kind: "review", report } : null);
      if (!needsReview(report))
        flash(report.newEntries.length ? `${nameOf(tally, tally.writers[report.newEntries[0].w]?.member)}'s update is in · ${hero(tally).title}` : "Already up to date");
    } catch (err) {
      setView({ name: "home" });
      flash(errorText(err), true);
    }
  }, [flash, showTally]);

  // Start: open the cache, handle a link in the address bar, then listen for links and other tabs.
  useEffect(() => {
    let alive = true;
    const cleanups = [];
    (async () => {
      const c = await openCache(cacheName);
      if (!alive) { c.close(); return; }       // React's development double-start
      cleanups.push(() => c.close());
      setCache(c);
      requestPersistence();
      await refresh(c);
      const url = takeLinkFromAddressBar();
      if (url) await handleLink(c, url); else setView({ name: "home" });
      if (!alive) return;

      const onHash = () => { const u = takeLinkFromAddressBar(); if (u) handleLink(c, u); };
      window.addEventListener("hashchange", onHash);
      cleanups.push(() => window.removeEventListener("hashchange", onHash));

      // Another tab saved: reload instead of later overwriting its changes.
      cleanups.push(c.onOtherTabChange(async (id) => {
        await refresh(c);
        if (currentRef.current?.tally.id !== id) return;
        const [tally, key] = await Promise.all([c.loadTally(id), c.loadKey(id)]);
        if (tally && key) setCurrent({ tally, key });
        else { setCurrent(null); setSheet(null); setView({ name: "home" }); }
      }));
    })();
    return () => { alive = false; cleanups.forEach(f => f()); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- runs once; handlers read state through refs

  // ─── changes to the open tally ─────────────────────────────────────────────

  /** Runs a change on the open tally, saves it, and re-renders. Errors become a toast. */
  const change = useCallback(async (fn, { ok, share } = {}) => {
    const { tally } = currentRef.current;
    try {
      await fn(tally);
      await save(cache, tally);
      if (ok) flash(ok);
      if (share) setSheet({ kind: "share", request: share });
    } catch (err) {
      flash(errorText(err), true);
    } finally {
      rerender();
    }
  }, [cache, flash]);

  async function goHome() {
    setCurrent(null);
    setSheet(null);
    setView({ name: "home" });
    await refresh(cache);
  }

  async function openTally(id) {
    const [tally, key] = await Promise.all([cache.loadTally(id), cache.loadKey(id)]);
    if (tally && key) showTally(tally, key); else flash("This tally isn't on this phone any more.", true);
  }

  async function createTally(form) {
    try {
      const { tally, key } = await startTally(cache, { ...form, friendNames: [form.friendName] });
      showTally(tally, key, { kind: "share", request: { invite: true } });
    } catch (err) { flash(errorText(err), true); }
  }

  async function joinTally(unlocked, memberId) {
    const { tally, returning } = await completeJoin(cache, unlocked, memberId);
    showTally(tally, unlocked.key);
    flash(returning ? "Welcome back. Your balance is restored from this link." : "You're in");
  }

  async function convertV1(answer) {
    try {
      const { tally, key, existing, added } = await convertDeviceV1(cache, { answer, rateFor });
      await refresh(cache);
      showTally(tally, key);
      if (existing) flash(added ? `Brought in ${added} new ${added === 1 ? "entry" : "entries"}` : "Already up to date");
    } catch (err) { flash(errorText(err), true); }
  }

  function answerWelcome(fresh) {
    return change(async t => {
      if (fresh) await setFreshStart(t, true);
      t.local = { ...t.local, welcomeAnswered: true };
    }, fresh ? { share: { message: MESSAGES.fresh } } : {});
  }

  async function submitPayment(fields) {
    const { tally } = current;
    const { edit, dispute } = view;
    try {
      if (!edit) {
        await recordPayment(cache, tally, { ...fields, rateFor });
        setView({ name: "tally" });
        setSheet({ kind: "share", request: { lastCategory: fields.category } });
        return;
      }
      // Only re-lock the rate when the amount, currency or date changed.
      const day = edit.pd ?? edit.d;
      const moneyChanged = fields.amount !== edit.a || fields.currency !== edit.c || fields.paidOn !== day;
      const value = moneyChanged ? (await valueInTallyCurrency(tally, fields.amount, fields.currency, fields.paidOn, rateFor)).value : edit.v;
      const changes = { k: fields.category, a: fields.amount, c: fields.currency, v: value, ...(fields.paidOn !== day ? { pd: fields.paidOn } : {}) };
      if (dispute) await acceptDispute(tally, [dispute.w, dispute.s], changes);
      else await editPayment(tally, edit.s, changes);
      await save(cache, tally);
      setView({ name: "details" });
      setSheet({ kind: "share", request: {} });
    } catch (err) {
      flash(errorText(err), true);
    } finally {
      rerender();
    }
  }

  const actions = current && {
    edit: (p) => setView({ name: "log", edit: p }),
    remove: (p) => change(t => voidPayment(t, p.s), { ok: "Deleted", share: {} }),
    notMe: (p) => change(t => notMe(t, [p.w, p.s]), { share: { message: MESSAGES.notMe } }),
    ask: (p, reason) => change(t => askAbout(t, [p.w, p.s], reason), { share: { message: MESSAGES.question } }),
    accept: (d, fix) => change(t => acceptDispute(t, [d.w, d.s], fix), { ok: "Done", share: {} }),
    keep: (d) => change(t => keepAsIs(t, [d.w, d.s]), { ok: "Kept as it was", share: {} }),
    fix: (d) => {
      const pay = paymentState(current.tally, ...d.r);
      if (pay) setView({ name: "log", edit: pay, dispute: d }); else flash("That payment was deleted.", true);
    },
    paidBack: (from, to, value) => change(t => addPaidBack(t, { from, to, value }), { ok: "Recorded", share: {} }),
    sort: () => setSheet({ kind: "sort" }),
    forget: async () => { await cache.forgetTally(current.tally.id); await goHome(); flash("Removed from this phone"); },
  };

  // ─── screens ───────────────────────────────────────────────────────────────

  let screen;
  switch (view.name) {
    case "home":
      screen = <Home tallies={tallies} v1={v1} onOpen={openTally} onStart={() => setView({ name: "start" })} onConvert={() => setView({ name: "convert" })} />;
      break;
    case "start":
      screen = <Start onBack={goHome} onCreate={createTally} />;
      break;
    case "join":
      screen = <Join header={view.header} onBack={goHome} onUnlock={(answer) => unlockLink(cache, view.url, answer)} onJoin={joinTally} />;
      break;
    case "convert":
      screen = v1 ? <ConvertV1 v1={v1} onBack={goHome} onConvert={convertV1} /> : null;
      break;
    case "tally":
      screen = current && (
        <TallyView tally={current.tally} onBack={goHome} onLog={() => setView({ name: "log" })} onDetails={() => setView({ name: "details" })}
          onShare={() => setSheet({ kind: "share", request: {} })} onWelcome={answerWelcome} />
      );
      break;
    case "log":
      screen = current && (
        <LogPayment tally={current.tally} rateFor={rateFor} onSubmit={submitPayment}
          onCancel={() => setView({ name: view.edit ? "details" : "tally" })}
          initial={view.edit && { category: view.edit.k, amount: view.edit.a, currency: view.edit.c, paidOn: view.edit.pd ?? view.edit.d }} />
      );
      break;
    case "details":
      screen = current && <Details tally={current.tally} onBack={() => setView({ name: "tally" })} actions={actions} />;
      break;
    default:
      screen = <p style={S.muted}>Opening…</p>;
  }

  return (
    <div style={S.page}>
      <Toast toast={toast} />
      <main style={S.column}>{screen}</main>
      {sheet?.kind === "share" && current && (
        <ShareSheet tally={current.tally} cryptoKey={current.key} origin={linkOrigin()} request={sheet.request}
          onShared={async (link) => { await markShared(cache, current.tally, link); rerender(); }}
          onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "review" && current && (
        <Review tally={current.tally} report={sheet.report}
          onClose={(acted) => setSheet(acted ? { kind: "share", request: { message: MESSAGES.question } } : null)}
          onNotMe={(e) => change(t => notMe(t, [e.w, e.s]))}
          onAsk={(e, r) => change(t => askAbout(t, [e.w, e.s], r))} />
      )}
      {sheet?.kind === "sort" && current && (
        <SortOld tally={current.tally} onClose={() => setSheet(null)} onSort={(refs, k) => change(t => recategorize(t, refs, k))} />
      )}
    </div>
  );
}
