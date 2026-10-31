// Home, starting a tally, joining from a link, and bringing in a Schplitz 1 tally.
import { useState } from "react";
import { normalizeAnswer } from "../../utils.js";
import { unsharedCount } from "../app.js";
import { hero, othersLabel, errorText } from "./format.js";
import { Button, Field, Icon, TopBar } from "./components.jsx";
import { C, S } from "./theme.js";

const ANSWER_HINT = "Capitals and spaces don't matter.";

export function Home({ tallies, v1, onOpen, onStart, onConvert }) {
  return (
    <>
      <header style={{ ...S.row, minHeight: 44 }}>
        <h1 style={{ ...S.h1, flex: 1 }}>Schplitz</h1>
        <span style={{ fontSize: 11, color: C.accent, border: `1px solid ${C.accentBorder}`, borderRadius: 999, padding: "3px 8px" }}>2 · preview</span>
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
              <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{othersLabel(t)}</span>
              <span style={{ display: "block", fontSize: 13, color: C.soft, marginTop: 3 }}>{h.title}{unshared ? ` · ${unshared} not shared yet` : ""}</span>
            </span>
            <Icon name="chevron_right" style={{ color: C.muted }} />
          </button>
        );
      })}

      {tallies.length === 0 && !v1 && (
        <p style={{ ...S.muted, fontSize: 15, margin: "24px 4px 8px" }}>Keep track of who's ahead with a friend, so you know who covers next time. No accounts, no server.</p>
      )}
      <Button icon="add" onClick={onStart}>Start a tally</Button>
      {v1?.converted && (
        <Button variant="ghost" onClick={onConvert}>Bring in Schplitz 1 data again</Button>
      )}
      <p style={{ ...S.muted, fontSize: 12, marginTop: 8 }}>
        Your tallies live in your chats: every link holds the balance. This phone only remembers them so you don't have to type the answer each time.
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
  const [form, setForm] = useState({ myName: "", friendName: "", question: "", answer: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const ready = form.myName.trim() && form.friendName.trim() && form.myName.trim() !== form.friendName.trim()
    && form.question.trim() && normalizeAnswer(form.answer) && normalizeAnswer(form.answer) === normalizeAnswer(form.confirm);
  async function submit() {
    setBusy(true);
    try { await onCreate({ myName: form.myName.trim(), friendName: form.friendName.trim(), question: form.question.trim(), answer: form.answer }); }
    finally { setBusy(false); }
  }
  return (
    <>
      <TopBar title="Start a tally" onBack={onBack} />
      <Field label="Your name" value={form.myName} onChange={set("myName")} maxLength={50} autoComplete="given-name" />
      <Field label="Who's it with?" value={form.friendName} onChange={set("friendName")} maxLength={50} />
      <Field label="A question only you two can answer" value={form.question} onChange={set("question")} maxLength={200}
        placeholder="Where did we first meet?" hint="Anyone who sees a link can read the question, so keep it vague." />
      <AnswerFields answer={form.answer} setAnswer={v => setForm(f => ({ ...f, answer: v }))} confirm={form.confirm} setConfirm={v => setForm(f => ({ ...f, confirm: v }))} />
      <Button disabled={!ready || busy} onClick={submit}>{busy ? "Setting up…" : "Start"}</Button>
      <p style={S.muted}>The answer is the key: links can only be opened with it. It never leaves your phone.</p>
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
        <p style={S.muted}>You type the answer once on this phone; after that, links open straight away.</p>
      </>) : (<>
        <h2 style={S.h2}>Which one are you?</h2>
        {unlocked.payload.m.map(([id, name]) => (
          <Button key={id} variant="secondary" disabled={busy} onClick={() => join(id)}>{name}</Button>
        ))}
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
        <p style={S.muted}>Type it exactly as you and {v1.names.find(n => n !== v1.myName)} agreed: both phones use it to find each other.</p>
      </>)}
      <Button disabled={!ready || busy} onClick={submit}>{busy ? "Bringing it in…" : "Bring it in"}</Button>
    </>
  );
}
