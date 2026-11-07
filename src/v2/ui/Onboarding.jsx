// Home, starting a tally, joining from a link, and bringing in a Schplitz 1 tally.
import { useRef, useState } from "react";
import { normalizeAnswer } from "../../shared/identity.js";
import { unsharedCount } from "../app.js";
import { hero, tallyTitle, errorText } from "./format.js";
import { Button, Chip, Field, Icon, TopBar, ICON_BUTTON } from "./components.jsx";
import { MAX_MEMBERS } from "../tally.js";
import { FLAG_LEGACY } from "../schema.js";
import { C, S } from "./theme.js";

const ANSWER_HINT = "Capitals and spaces don't matter.";

/** Shown in an app's built-in browser, whose storage is separate from the phone's browser (docs §4.1). */
export function InAppHint({ app, onCopy }) {
  return (
    <section role="note" style={{ ...S.card, borderColor: C.other }}>
      <p style={{ margin: 0, fontSize: 14 }}>You're in {app ? `${app}'s` : "an app's"} built-in browser.</p>
      <p style={{ ...S.muted, marginTop: 4 }}>Open this page in your phone's own browser so it remembers your tally. Nothing is lost if you don't, because the link has your balance.</p>
      <Button variant="secondary" style={{ marginTop: 10 }} onClick={onCopy}>Copy this page's link</Button>
    </section>
  );
}

export function Home({ tallies, v1, onOpen, onStart, onConvert, onOpenFile, onInstall }) {
  const fileInput = useRef(null);
  return (
    <>
      <header style={{ ...S.row, minHeight: 44 }}>
        <h1 style={{ ...S.h1, flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 11, background: `linear-gradient(135deg, ${C.purple}, #8FA8F5)`, color: C.text,
            display: "grid", placeItems: "center", fontSize: 19 }}>S</span>
          Schplitz
        </h1>
        {location.pathname.startsWith("/v2") && (
          <span style={{ fontSize: 11, color: C.accent, border: `1px solid ${C.accentBorder}`, borderRadius: 999, padding: "3px 8px" }}>2 · preview</span>
        )}
      </header>

      {v1 && !v1.converted && (
        <section style={{ ...S.card, borderColor: C.accentBorder }}>
          <h2 style={S.h2}>Your tally with {v1.names.find(n => n !== v1.myName)} from Schplitz 1</h2>
          <p style={{ ...S.muted, marginTop: 6 }}>Bring it into Schplitz 2. Your Schplitz 1 data stays as it is.</p>
          <Button style={{ marginTop: 12 }} onClick={onConvert}>Bring it in</Button>
        </section>
      )}

      {tallies.map(t => {
        const h = hero(t), unshared = unsharedCount(t);
        return (
          <button key={t.id} type="button" onClick={() => onOpen(t.id)}
            style={{ ...S.card, color: C.text, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: "inherit" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{tallyTitle(t)}</span>
              <span style={{ display: "block", fontSize: 13, color: C.soft, marginTop: 3 }}>{h.title}{unshared ? ` · ${unshared} not shared yet` : ""}</span>
            </span>
            <Icon name="chevron_right" style={{ color: C.muted }} />
          </button>
        );
      })}

      {tallies.length === 0 && !v1 && (
        <p style={{ ...S.muted, fontSize: 15, margin: "24px 4px 8px" }}>Keep track of who's ahead with a friend, so you know who covers next time. No sign-up, and Schplitz stores nothing.</p>
      )}
      <Button icon="add" onClick={onStart}>Start a tally</Button>
      <Button variant="ghost" icon="upload_file" onClick={() => fileInput.current?.click()}>Open a full copy</Button>
      <input ref={fileInput} type="file" accept=".schplitz,.txt,.json,text/plain,application/json" aria-label="Full copy file" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onOpenFile(f); }} />
      {v1?.converted && (
        <Button variant="ghost" onClick={onConvert}>Bring in Schplitz 1 data again</Button>
      )}
      {onInstall && <Button variant="ghost" icon="mobile_arrow_down" onClick={onInstall}>Install Schplitz</Button>}
      <p style={{ ...S.muted, fontSize: 12, marginTop: 8 }}>
        Every link you share holds the full balance, so your chats are the real record. This phone just remembers your tallies so you don't have to type the answer each time.
      </p>
    </>
  );
}

function AnswerFields({ answer, setAnswer, confirm, setConfirm }) {
  const mismatch = confirm && normalizeAnswer(answer) !== normalizeAnswer(confirm);
  return (<>
    <Field label="Answer" type="password" autoComplete="off" value={answer} onChange={e => setAnswer(e.target.value)} hint={ANSWER_HINT} />
    <Field label="Answer again" type="password" autoComplete="off" value={confirm} onChange={e => setConfirm(e.target.value)}
      hint={mismatch ? "The answers don't match." : undefined} />
  </>);
}

export function Start({ onBack, onCreate }) {
  const [form, setForm] = useState({ myName: "", friends: [""], name: "", question: "", answer: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setFriend = (i, value) => setForm(f => ({ ...f, friends: f.friends.map((x, j) => (j === i ? value : x)) }));
  const names = [form.myName, ...form.friends].map(n => n.trim());
  const distinct = new Set(names.map(n => n.toLowerCase())).size === names.length;
  const ready = names.every(Boolean) && distinct && form.question.trim()
    && normalizeAnswer(form.answer) && normalizeAnswer(form.answer) === normalizeAnswer(form.confirm);
  async function submit() {
    setBusy(true);
    try {
      await onCreate({ myName: names[0], friendNames: names.slice(1), name: form.name.trim(), question: form.question.trim(), answer: form.answer });
    } finally { setBusy(false); }
  }
  return (
    <>
      <TopBar title="Start a tally" onBack={onBack} />
      <Field label="Your name" value={form.myName} onChange={set("myName")} maxLength={50} autoComplete="given-name" />
      {form.friends.map((friend, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          <div style={{ flex: 1 }}>
            <Field label={i === 0 ? "Who's it with?" : `Person ${i + 2}`} value={friend} onChange={e => setFriend(i, e.target.value)} maxLength={50} />
          </div>
          {i > 0 && (
            <button type="button" aria-label={`Remove person ${i + 2}`} onClick={() => setForm(f => ({ ...f, friends: f.friends.filter((_, j) => j !== i) }))}
              style={{ ...ICON_BUTTON, color: C.muted, margin: 0, marginBottom: 4 }}><Icon name="close" /></button>
          )}
        </div>
      ))}
      {form.friends.length < MAX_MEMBERS - 1 && (
        <Button variant="ghost" icon="add" onClick={() => setForm(f => ({ ...f, friends: [...f.friends, ""] }))}>Add someone</Button>
      )}
      {!distinct && names.every(Boolean) && <p role="alert" style={{ color: C.danger, fontSize: 13, margin: 0 }}>Everyone needs a different name.</p>}
      {form.friends.length > 1 && (
        <Field label="Name for the group (optional)" value={form.name} onChange={set("name")} maxLength={50} placeholder="Padel crew" />
      )}
      <Field label={form.friends.length > 1 ? "A question only your group can answer" : "A question only you two can answer"} value={form.question} onChange={set("question")} maxLength={200}
        placeholder="Where did we first meet?"
        info="Anyone with a link can read the question, so keep it vague. Everything else in a link is locked." />
      <AnswerFields answer={form.answer} setAnswer={v => setForm(f => ({ ...f, answer: v }))} confirm={form.confirm} setConfirm={v => setForm(f => ({ ...f, confirm: v }))} />
      <Button disabled={!ready || busy} onClick={submit}>{busy ? "Setting up…" : "Start"}</Button>
      <p style={S.muted}>Links only open with the answer. It never leaves your phone.</p>
    </>
  );
}

/** Opening a link for a tally this phone doesn't have: the answer, then who you are. */
export function Join({ header, onBack, onUnlock, onJoin }) {
  const [answer, setAnswer] = useState("");
  const [unlocked, setUnlocked] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setBusy(true); setError(null);
    try { setUnlocked(await onUnlock(answer)); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function join(memberId) {
    setBusy(true); setError(null);
    try { await onJoin(unlocked, memberId); } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <>
      <TopBar title="Open a tally" onBack={onBack} />
      {!unlocked ? (<>
        <section style={S.card}>
          <p style={{ ...S.muted, marginBottom: 6 }}>The question</p>
          <p style={{ margin: 0, fontSize: 18 }}>{header.question}</p>
        </section>
        <Field label="Your answer" type="password" autoComplete="off" value={answer} onChange={e => setAnswer(e.target.value)} hint={ANSWER_HINT}
          onKeyDown={e => { if (e.key === "Enter" && normalizeAnswer(answer)) unlock(); }} autoFocus />
        {error && <p role="alert" style={{ color: C.danger, fontSize: 14, margin: 0 }}>{error}</p>}
        <Button disabled={!normalizeAnswer(answer) || busy} onClick={unlock}>{busy ? "Unlocking…" : "Open"}</Button>
        <p style={S.muted}>You only type the answer once on this phone. After that, links open straight away.</p>
      </>) : (<>
        <h2 style={S.h2}>Which one are you?</h2>
        {unlocked.payload.m.map(([id, name]) => {
          // A name that already has history was picked on another phone: fine if it's yours (a new phone).
          const taken = Object.values(unlocked.payload.w).some(x => x.m === id && !(x.fl & FLAG_LEGACY) && x.s > 0);
          return (
            <div key={id}>
              <Button variant="secondary" disabled={busy} onClick={() => join(id)}>{name}</Button>
              {taken && <p style={{ ...S.muted, fontSize: 12, margin: "4px 4px 0" }}>{name} already uses Schplitz on another phone. Only pick this if it's you.</p>}
            </div>
          );
        })}
        {error && <p role="alert" style={{ color: C.danger, fontSize: 14, margin: 0 }}>{error}</p>}
      </>)}
    </>
  );
}

export function ConvertV1({ v1, onBack, onConvert }) {
  const [answer, setAnswer] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !v1.needsAnswer || (normalizeAnswer(answer) && normalizeAnswer(answer) === normalizeAnswer(confirm));
  async function submit() {
    setBusy(true);
    try { await onConvert(v1.needsAnswer ? answer : undefined); } finally { setBusy(false); }
  }
  return (
    <>
      <TopBar title="Bring in your tally" onBack={onBack} />
      <section style={S.card}>
        <p style={{ margin: 0, fontSize: 15 }}>Your tally with {v1.names.find(n => n !== v1.myName)} moves into Schplitz 2 with all its entries.</p>
        <p style={{ ...S.muted, marginTop: 8 }}>Nothing changes in Schplitz 1, and you can bring it in again later.</p>
      </section>
      {v1.needsAnswer && (<>
        <section style={S.card}>
          <p style={{ ...S.muted, marginBottom: 6 }}>Your question</p>
          <p style={{ margin: 0, fontSize: 18 }}>{v1.question}</p>
        </section>
        <AnswerFields answer={answer} setAnswer={setAnswer} confirm={confirm} setConfirm={setConfirm} />
        <p style={S.muted}>Use the same answer as {v1.names.find(n => n !== v1.myName)}. Both phones need it to find each other.</p>
      </>)}
      <Button disabled={!ready || busy} onClick={submit}>{busy ? "Bringing it in…" : "Bring it in"}</Button>
    </>
  );
}

/**
 * An old Schplitz 1 link (or text export) opened in Schplitz 2 (migration doc, step 5).
 * needsName: this phone has no tally for it yet, so ask which name is yours.
 */
export function OldLink({ share, needsName, onBack, onSubmit }) {
  const [answer, setAnswer] = useState("");
  const [myName, setMyName] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const ready = normalizeAnswer(answer) && (!needsName || myName) && !busy;

  async function submit() {
    setBusy(true); setError(null);
    try { await onSubmit({ answer, myName }); } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <>
      <TopBar title="A Schplitz 1 link" onBack={onBack} />
      <section style={S.card}>
        <p style={{ margin: 0, fontSize: 15 }}>This link is from the old version of Schplitz. It opens here too.</p>
        <p style={{ ...S.muted, marginTop: 8 }}>
          {needsName ? "The tally comes in with all its entries." : "It can update the entries of your tally from Schplitz 1."}
        </p>
      </section>
      <section style={S.card}>
        <p style={{ ...S.muted, marginBottom: 6 }}>The question</p>
        <p style={{ margin: 0, fontSize: 18 }}>{share.question || "(no question)"}</p>
      </section>
      <Field label="Your answer" type="password" autoComplete="off" value={answer} onChange={e => setAnswer(e.target.value)} hint={ANSWER_HINT} autoFocus />
      {needsName && (<>
        <h2 style={S.h2}>Which one are you?</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {share.names.map(n => <Chip key={n} on={myName === n} onClick={() => setMyName(n)}>{n}</Chip>)}
        </div>
      </>)}
      {error && <p role="alert" style={{ color: C.danger, fontSize: 14, margin: 0 }}>{error}</p>}
      <Button disabled={!ready} onClick={submit}>{busy ? "Opening…" : "Open"}</Button>
    </>
  );
}
