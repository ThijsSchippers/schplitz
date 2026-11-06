// Schplitz 2 — the app: which screen is showing, and what each action does.
//
// The open tally is one object that tally.js mutates in place; after each change it's
// saved to the cache and the screen re-renders. Screens get it as a prop and read it.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  changeTally, updatePayment, startTally, openLink, unlockLink, completeJoin, recordPayment, markShared, v1Status, convertDeviceV1,
  readLinkFile, backupDue, markBackedUp, readOldLink, tallyForOldLink, openOldLink,
} from "../app.js";
import { voidPayment, notMe, askAbout, acceptDispute, keepAsIs, addPaidBack, setFreshStart, recategorize, renameTally, addMember, paymentState } from "../tally.js";
import { defaultRate } from "../migrate.js";
import { errorText, hero, nameOf } from "./format.js";
import { Toast } from "./components.jsx";
import { Home, Start, Join, ConvertV1, InAppHint, OldLink } from "./Onboarding.jsx";
import TallyView from "./TallyView.jsx";
import LogPayment from "./LogPayment.jsx";
import Details from "./Details.jsx";
import { ShareSheet, Review, SortOld, FullCopySheet } from "./Sheets.jsx";
import { browserKind } from "./environment.js";
import { USED_KEY } from "./visits.js";
import { S, GLOBAL_CSS } from "./theme.js";

import { initialNavigation, navigationReducer } from "./navigation.js";
import { useBrowserSession, useInstallPrompt, linkOrigin } from "./useBrowserSession.js";

const TOAST_MS = 3200;

const MESSAGES = {
  notMe: "I wasn't part of one of the payments. Can you take a look?",
  question: "I've got a question about one of the payments.",
  fresh: "I've started our tally fresh from here.",
};

/** A review sheet is worth showing when something needs a look; otherwise a toast is enough. */
const needsReview = (report) =>
  report.involvingMe.length > 0 || report.replaced.length > 0 || report.conflicts.length > 0 || report.review.some(r => r.theyMiss.length > 0);

const BROWSER = browserKind();

/** firstView: "start" opens the start screen instead of home (from the landing page). */
export default function App({ rateFor = defaultRate, cacheName, firstView = "home" }) {
  const [cache, setCache] = useState(null);
  const [tallies, setTallies] = useState([]);
  const [v1, setV1] = useState(null);
  const [{ view, current, sheet, present }, dispatch] = useReducer(navigationReducer, initialNavigation);
  const setView = useCallback(nextView => dispatch({ type: "view", view: nextView }), []);
  const setSheet = nextSheet => dispatch({ type: "sheet", sheet: nextSheet });
  const setPresent = members => dispatch({ type: "present", members });
  const [, rerender] = useReducer(x => x + 1, 0);
  const [toast, setToast] = useState(null);
  const { canInstall, install } = useInstallPrompt();
  const lastLink = useRef(null);                          // the link this page was opened with, for the in-app hint
  const toastTimer = useRef();
  const currentRef = useRef(null);
  currentRef.current = current;

  const flash = useCallback((text, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const refresh = useCallback(async (c, signal) => {
    const list = await c.listTallies();
    if (signal?.aborted) return;
    setTallies(list);
    // Returning visitors skip the landing page (Site.jsx).
    if (list.length) try { localStorage.setItem(USED_KEY, "1"); } catch { /* storage blocked: harmless */ }
    const status = await v1Status(c).catch(() => null);
    if (!signal?.aborted) setV1(status);
  }, []);

  const showTally = useCallback((tally, key, nextSheet = null) => {
    dispatch({ type: "openTally", tally, key, sheet: nextSheet });
  }, []);

  const handleLink = useCallback(async (c, url, signal) => {
    lastLink.current = url;
    try {
      if (url.includes("#share=")) {
        const share = await readOldLink(url);
        const needsName = !(await tallyForOldLink(c, share));
        if (!signal?.aborted) dispatch({ type: "oldLink", share, needsName });
        return;
      }
      const r = await openLink(c, url);
      if (signal?.aborted) return;
      if (r.kind === "join") { dispatch({ type: "join", url, header: r.header }); return; }
      const { report, tally } = r;
      showTally(tally, r.key, needsReview(report) ? { kind: "review", report } : null);
      if (!needsReview(report))
        flash(report.newEntries.length ? `Got ${nameOf(tally, tally.writers[report.newEntries[0].w]?.member)}'s update. ${hero(tally).title}.` : "Nothing new in this link.");
    } catch (err) {
      if (signal?.aborted) return;
      dispatch({ type: "home" });
      flash(errorText(err), true);
    }
  }, [flash, showTally]);

  useBrowserSession({
    cacheName,
    onReady: async (c, signal) => {
      setCache(c);
      await refresh(c, signal);
    },
    onLocation: async (c, url, signal) => {
      if (url) await handleLink(c, url, signal);
      else setView({ name: firstView === "start" ? "start" : "home" });
    },
    onOtherTab: async (c, id, signal) => {
      await refresh(c, signal);
      if (signal.aborted || currentRef.current?.tally.id !== id) return;
      const [tally, key] = await Promise.all([c.loadTally(id), c.loadKey(id)]);
      if (!signal.aborted) dispatch({ type: "reload", id, tally, key });
    },
    onError: error => { dispatch({ type: "home" }); flash(errorText(error), true); },
  });

  // ─── changes to the open tally ─────────────────────────────────────────────

  /** Runs a change on the open tally, saves it, and re-renders. Errors become a toast. */
  const change = useCallback(async (fn, { ok, share } = {}) => {
    const { tally } = currentRef.current;
    try {
      await changeTally(cache, tally, fn);
      if (ok) flash(ok);
      if (share) dispatch({ type: "sheet", sheet: { kind: "share", request: share } });
    } catch (err) {
      flash(errorText(err), true);
    } finally {
      rerender();
    }
  }, [cache, flash]);

  async function goHome() {
    dispatch({ type: "home" });
    await refresh(cache);
  }

  async function openTally(id) {
    const [tally, key] = await Promise.all([cache.loadTally(id), cache.loadKey(id)]);
    if (tally && key) showTally(tally, key); else flash("This tally isn't on this phone any more.", true);
  }

  async function createTally(form) {
    try {
      const { tally, key } = await startTally(cache, form);
      showTally(tally, key, { kind: "share", request: { invite: true } });
    } catch (err) { flash(errorText(err), true); }
  }

  async function joinTally(unlocked, memberId) {
    const { tally, returning } = await completeJoin(cache, unlocked, memberId);
    showTally(tally, unlocked.key);
    flash(returning ? "Welcome back. Your balance is restored." : "You're in.");
  }

  async function openFile(file) {
    try {
      const found = await readLinkFile(file);
      if (found.kind === "link") await handleLink(cache, found.url);
      else dispatch({ type: "oldLink", share: found.share, needsName: !(await tallyForOldLink(cache, found.share)) });
    } catch (err) { flash(errorText(err), true); }
  }

  const OLD_LINK_RESULT = {
    created: "Your Schplitz 1 tally is in.",
    updated: "Updated with the newer entries from this link.",
    "up-to-date": "Your tally already has everything from this old link.",
    older: "This link is older than what you have. Nothing changed.",
  };

  async function openOld({ answer, myName }) {
    const { outcome, tally, key } = await openOldLink(cache, view.share, { answer, myName, rateFor });
    await refresh(cache);
    showTally(tally, key);
    flash(OLD_LINK_RESULT[outcome]);
  }

  async function copyCurrentLink() {
    try { await navigator.clipboard.writeText(lastLink.current ?? location.href); flash("Link copied. Paste it in your browser."); }
    catch { flash("Couldn't copy. Open the link from your chat in your browser instead.", true); }
  }

  async function convertV1(answer) {
    try {
      const { tally, key, existing, added } = await convertDeviceV1(cache, { answer, rateFor });
      await refresh(cache);
      showTally(tally, key);
      if (existing) flash(added ? `Brought in ${added} new ${added === 1 ? "entry" : "entries"}.` : "Nothing new to bring in.");
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
      if (edit) await updatePayment(cache, tally, edit, fields, { dispute, rateFor });
      else await recordPayment(cache, tally, { ...fields, rateFor });
      dispatch({ type: "paymentSaved", editing: Boolean(edit), category: fields.category });
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
    keep: (d) => change(t => keepAsIs(t, [d.w, d.s]), { ok: "Left as it was", share: {} }),
    fix: (d) => {
      const pay = paymentState(current.tally, ...d.r);
      if (pay) setView({ name: "log", edit: pay, dispute: d }); else flash("That payment has been deleted.", true);
    },
    paidBack: (from, to, value) => change(t => addPaidBack(t, { from, to, value }), { ok: "Recorded", share: {} }),
    sort: () => setSheet({ kind: "sort" }),
    // They appear on the other phones with the next link. Whoever's marked as here stays marked.
    addPerson: (name) => change(t => { const m = addMember(t, name); dispatch({ type: "memberAdded", id: m.id }); },
      { ok: `Added ${name.trim()}`, share: { message: `I added ${name.trim()} to our tally.` } }),
    rename: (name) => change(t => renameTally(t, name), { ok: "Saved", share: {} }),
    fullCopy: () => setSheet({ kind: "fullCopy", mode: "send" }),
    forget: async () => { await cache.forgetTally(current.tally.id); await goHome(); flash("Removed from this phone"); },
  };

  // ─── screens ───────────────────────────────────────────────────────────────

  let screen;
  switch (view.name) {
    case "home":
      screen = <Home tallies={tallies} v1={v1} onOpen={openTally} onStart={() => setView({ name: "start" })} onConvert={() => setView({ name: "convert" })}
        onOpenFile={openFile} onInstall={canInstall && !BROWSER.appleWebKit ? install : null} />;
      break;
    case "start":
      screen = <Start onBack={goHome} onCreate={createTally} />;
      break;
    case "join":
      screen = <Join header={view.header} onBack={goHome} onUnlock={(answer) => unlockLink(cache, view.url, answer)} onJoin={joinTally} />;
      break;
    case "oldLink":
      screen = <OldLink share={view.share} needsName={view.needsName} onBack={goHome} onSubmit={openOld} />;
      break;
    case "convert":
      screen = v1 ? <ConvertV1 v1={v1} onBack={goHome} onConvert={convertV1} /> : null;
      break;
    case "tally":
      screen = current && (
        <TallyView tally={current.tally} present={present} onPresent={setPresent}
          backupDue={BROWSER.appleWebKit && backupDue(current.tally)} onBackup={() => setSheet({ kind: "fullCopy", mode: "backup" })}
          onBack={goHome} onLog={() => setView({ name: "log" })} onDetails={() => setView({ name: "details" })}
          onShare={() => setSheet({ kind: "share", request: {} })} onWelcome={answerWelcome} />
      );
      break;
    case "log":
      screen = current && (
        <LogPayment tally={current.tally} rateFor={rateFor} onSubmit={submitPayment} defaultParticipants={present.length ? present : undefined}
          onCancel={() => dispatch({ type: "cancelPayment" })}
          initial={view.edit && { category: view.edit.k, amount: view.edit.a, currency: view.edit.c, paidOn: view.edit.pd ?? view.edit.d, participants: view.edit.p }} />
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
      <style>{GLOBAL_CSS}</style>
      <Toast toast={toast} />
      <main style={S.column}>
        {BROWSER.inApp !== null && view.name !== "loading" && <InAppHint app={BROWSER.inApp} onCopy={copyCurrentLink} />}
        {screen}
      </main>
      {sheet?.kind === "share" && current && (
        <ShareSheet tally={current.tally} cryptoKey={current.key} origin={linkOrigin()} request={sheet.request}
          onShared={async (link) => { await markShared(cache, current.tally, link); rerender(); }}
          onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "review" && current && (
        <Review tally={current.tally} report={sheet.report}
          onClose={(acted) => setSheet(acted ? { kind: "share", request: { message: MESSAGES.question } } : null)}
          onFullCopy={() => setSheet({ kind: "fullCopy", mode: "send" })}
          onNotMe={(e) => change(t => notMe(t, [e.w, e.s]))}
          onAsk={(e, r) => change(t => askAbout(t, [e.w, e.s], r))} />
      )}
      {sheet?.kind === "fullCopy" && current && (
        <FullCopySheet tally={current.tally} cryptoKey={current.key} origin={linkOrigin()} mode={sheet.mode}
          onDone={async () => { if (sheet.mode === "backup") { await markBackedUp(cache, current.tally); rerender(); } }}
          onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "sort" && current && (
        <SortOld tally={current.tally} onClose={() => setSheet(null)} onSort={(refs, k) => change(t => recategorize(t, refs, k))} />
      )}
    </div>
  );
}
