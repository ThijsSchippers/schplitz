// Details (docs/v2.0.md §9.7): the exact numbers, disputes, and changes.
import { useState } from "react";
import { CATEGORIES } from "../categories.js";
import { allEntries, balance, dayNumber, freshStart, openDisputes, paymentState, tallyName, whoseTurn, MAX_MEMBERS, QUERY_REASONS } from "../tally.js";
import { decimalsOf } from "../encoding.js";
import { minorOfText, textOfMinor } from "./numpad.js";
import { money, nameOf, payments, dayLabel, QUERY_LABELS, QUERY_CHIPS } from "./format.js";
import { Button, Chip, Field, Icon, Sheet, TopBar } from "./components.jsx";
import { C, S } from "./theme.js";

const refKey = (w, s) => `${w}:${s}`;

function Amount({ tally, p }) {
  const foreign = p.c !== tally.currency;
  return (
    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ fontSize: 14 }}>{money(p.a, p.c)}</span>
      {foreign && <span style={{ display: "block", fontSize: 11, color: C.muted }}>≈ {money(p.v, tally.currency)}{p.e ? " · estimated rate" : ""}</span>}
    </span>
  );
}

export default function Details({ tally, onBack, actions }) {
  const today = dayNumber();
  const me = tally.me.member;
  const nets = balance(tally);
  const list = payments(tally);
  const open = openDisputes(tally);
  const forMe = open.filter(d => tally.writers[d.r[0]]?.member === me);
  const mine = open.filter(d => tally.writers[d.w]?.member === me);
  const disputedByMe = new Set(mine.filter(d => d.t === "notme").map(d => refKey(...d.r)));
  const questioned = new Set(forMe.map(d => refKey(...d.r)));
  const backs = allEntries(tally).filter(e => e.t === "back").sort((a, b) => b.d - a.d);
  const sortable = list.some(p => p.legacy && !p.provisional && p.payer === me);
  const [expanded, setExpanded] = useState(null);
  const [asking, setAsking] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [paidBack, setPaidBack] = useState(null);     // { from, to, text }
  const [naming, setNaming] = useState(null);          // { kind: "rename" | "add", text }

  // After "start fresh", converted v1 entries don't count, here or in the balance.
  const counted = freshStart(tally) ? list.filter(p => !p.legacy) : list;
  const paidTotal = (id) => counted.filter(p => p.payer === id).reduce((sum, p) => sum + p.v, 0);
  const payOf = (d) => paymentState(tally, ...d.r);
  const describe = (p) => p ? `${CATEGORIES[p.k]?.name ?? "Payment"}, ${money(p.v, tally.currency)}` : "a deleted payment";

  const turn = whoseTurn(tally);
  const mostAhead = [...tally.members].sort((a, b) => nets[b.id] - nets[a.id])[0];
  const group = tally.members.length > 2;
  const paidBackMinor = paidBack ? minorOfText(paidBack.text, decimalsOf(tally.currency)) : 0;

  return (
    <>
      <TopBar title="Details" onBack={onBack} />

      <section style={S.card}>
        {tally.members.map(m => {
          const n = nets[m.id];
          return (
            <div key={m.id} style={{ ...S.row, padding: "6px 0" }}>
              <span style={{ flex: 1 }}>{m.id === me ? "You" : m.name}</span>
              <span style={{ fontSize: 13, color: C.muted, marginRight: 12 }}>paid {money(paidTotal(m.id), tally.currency)}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: n > 0 ? C.ok : n < 0 ? C.danger : C.soft, minWidth: 90, textAlign: "right" }}>
                {n === 0 ? "even" : `${money(Math.abs(n), tally.currency)} ${n > 0 ? "ahead" : "behind"}`}
              </span>
            </div>
          );
        })}
      </section>

      {forMe.length > 0 && <h2 style={S.sectionLabel}>Needs your answer</h2>}
      {forMe.map(d => {
        const who = nameOf(tally, tally.writers[d.w].member);
        const frozen = d.r[0] !== tally.me.writer;
        return (
          <section key={refKey(d.w, d.s)} style={{ ...S.card, borderColor: C.other }}>
            <p style={{ margin: 0, fontSize: 15 }}>{d.t === "notme" ? `${who} says they weren't there` : `${who} asks about ${QUERY_LABELS[d.q]}`}</p>
            <p style={{ ...S.muted, marginTop: 4 }}>{describe(payOf(d))}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {d.t === "notme" ? (<>
                <Button style={{ flex: 1 }} onClick={() => actions.accept(d)}>Take {who} out</Button>
                <Button variant="secondary" style={{ flex: 1 }} onClick={() => actions.keep(d)}>Put {who} back</Button>
              </>) : (<>
                <Button variant="secondary" style={{ flex: 1 }} onClick={() => actions.keep(d)}>It's right</Button>
                {!frozen && <Button style={{ flex: 1 }} onClick={() => actions.fix(d)}>Fix it</Button>}
                {!frozen && <Button variant="danger" style={{ flex: 1 }} onClick={() => actions.accept(d, { void: true })}>Delete it</Button>}
              </>)}
            </div>
          </section>
        );
      })}

      {mine.length > 0 && <h2 style={S.sectionLabel}>Waiting for an answer</h2>}
      {mine.map(d => (
        <p key={refKey(d.w, d.s)} style={{ ...S.muted, padding: "0 4px" }}>
          {d.t === "notme" ? "You said you weren't there" : `You asked about ${QUERY_LABELS[d.q]}`} ({describe(payOf(d))}).
          Waiting for {nameOf(tally, tally.writers[d.r[0]]?.member)}.
        </p>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!turn.aboutEven && (
          <Button variant="secondary" icon="payments" style={{ flex: 1 }}
            onClick={() => setPaidBack({ from: turn.member, to: mostAhead.id, text: textOfMinor(Math.min(Math.abs(turn.net), nets[mostAhead.id]), decimalsOf(tally.currency)) })}>
            Record paid back
          </Button>
        )}
        {sortable && <Button variant="secondary" icon="category" style={{ flex: 1 }} onClick={actions.sort}>Sort old entries</Button>}
      </div>

      <h2 style={S.sectionLabel}>Payments</h2>
      {list.length === 0 && <p style={S.muted}>No payments yet.</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {list.map(p => {
          const key = refKey(p.w, p.s);
          const open_ = expanded === key;
          const canDispute = !p.mine && p.payer !== me && p.p.includes(me) && !disputedByMe.has(key);
          const note = tally.v1?.notes?.[p.l];
          return (
            <li key={key} style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
              <button type="button" aria-expanded={open_} onClick={() => setExpanded(open_ ? null : key)}
                style={{ width: "100%", background: "none", border: "none", color: C.text, display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span style={{ color: p.payer === me ? C.accent : C.other, display: "flex" }}><Icon name={CATEGORIES[p.k]?.icon ?? "more_horiz"} size={22} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14 }}>{CATEGORIES[p.k]?.name ?? "Something else"}</span>
                  <span style={{ display: "block", fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.payer === me ? "You" : nameOf(tally, p.payer)} · {dayLabel(p.day, today)}{group && p.p.length < tally.members.length ? ` · ${p.p.length} of ${tally.members.length}` : ""}{note ? ` · “${note}”` : ""}{disputedByMe.has(key) ? " · you weren't there" : ""}{questioned.has(key) ? " · question open" : ""}
                  </span>
                </span>
                <Amount tally={tally} p={p} />
              </button>
              {open_ && (
                <div style={{ display: "flex", gap: 8, padding: "0 4px 12px", flexWrap: "wrap" }}>
                  {p.mine && <Button variant="secondary" style={{ flex: 1 }} onClick={() => actions.edit(p)}>Change</Button>}
                  {p.mine && <Button variant="danger" style={{ flex: 1 }} onClick={() => setConfirm({ text: `Delete this ${CATEGORIES[p.k].name.toLowerCase()} payment?`, run: () => actions.remove(p) })}>Delete</Button>}
                  {canDispute && <Button variant="secondary" icon="person_off" style={{ flex: 1 }} onClick={() => actions.notMe(p)}>Not me</Button>}
                  {canDispute && <Button variant="secondary" icon="help" style={{ flex: 1 }} onClick={() => setAsking(p)}>Ask about it</Button>}
                  {p.legacy && !p.provisional && p.payer === me && <p style={{ ...S.muted, width: "100%" }}>Entries from Schplitz 1 can be sorted, not changed.</p>}
                  {note && <p style={{ ...S.muted, width: "100%" }}>“{note}” is only on this phone.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {backs.length > 0 && <h2 style={S.sectionLabel}>Paid back</h2>}
      {backs.map(b => (
        <p key={refKey(b.w, b.s)} style={{ ...S.muted, padding: "0 4px", display: "flex", justifyContent: "space-between" }}>
          <span>{nameOf(tally, b.fr)} paid {nameOf(tally, b.to)} back · {dayLabel(b.d, today)}</span>
          <span>{money(b.v, tally.currency)}</span>
        </p>
      ))}

      <h2 style={S.sectionLabel}>This tally</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tally.members.length < MAX_MEMBERS && (
          <Button variant="secondary" icon="person_add" style={{ flex: 1 }} onClick={() => setNaming({ kind: "add", text: "" })}>Add someone</Button>
        )}
        <Button variant="secondary" icon="edit" style={{ flex: 1 }} onClick={() => setNaming({ kind: "rename", text: tallyName(tally) ?? "" })}>
          {tallyName(tally) ? "Rename" : "Give it a name"}
        </Button>
      </div>
      <Button variant="secondary" icon="download" onClick={actions.fullCopy}>Send a full copy</Button>
      <p style={S.muted}>Use this when someone gets a new phone. It's a file with all the history, not just the last 30 days.</p>

      <Button variant="ghost" style={{ marginTop: 18 }} onClick={() => setConfirm({
        text: "Remove this tally from this phone? You can get it back by opening the latest link in your chat and typing the answer.",
        action: "Remove", run: actions.forget,
      })}>Remove from this phone</Button>

      {asking && (
        <Sheet title="What's off?" onClose={() => setAsking(null)}>
          <p style={S.muted}>{nameOf(tally, asking.payer)} sees your question and can fix it.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {QUERY_REASONS.map(r => <Chip key={r} on={false} onClick={() => { actions.ask(asking, r); setAsking(null); }}>{QUERY_CHIPS[r]}</Chip>)}
          </div>
        </Sheet>
      )}

      {confirm && (
        <Sheet title="Are you sure?" onClose={() => setConfirm(null)}>
          <p style={{ ...S.muted, fontSize: 14 }}>{confirm.text}</p>
          <Button variant="danger" onClick={() => { confirm.run(); setConfirm(null); }}>{confirm.action ?? "Delete"}</Button>
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
        </Sheet>
      )}

      {paidBack && (
        <Sheet title="Record paid back" onClose={() => setPaidBack(null)}>
          <p style={S.muted}>For money that changed hands outside Schplitz. It only shows up in Details.</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
            <select aria-label="Who paid" value={paidBack.from} onChange={e => setPaidBack(x => ({ ...x, from: e.target.value }))} style={{ ...S.input, width: "auto", flex: 1 }}>
              {tally.members.map(m => <option key={m.id} value={m.id}>{m.id === me ? "You" : m.name}</option>)}
            </select>
            <span>paid back</span>
            <select aria-label="Who received it" value={paidBack.to} onChange={e => setPaidBack(x => ({ ...x, to: e.target.value }))} style={{ ...S.input, width: "auto", flex: 1 }}>
              {tally.members.map(m => <option key={m.id} value={m.id}>{m.id === me ? "you" : m.name}</option>)}
            </select>
          </div>
          <input inputMode="decimal" aria-label="Amount paid back" value={paidBack.text}
            onChange={e => setPaidBack(x => ({ ...x, text: e.target.value.replace(",", ".").replace(/[^\d.]/g, "") }))}
            style={{ ...S.input, fontSize: 22, textAlign: "center" }} />
          <Button disabled={paidBackMinor <= 0 || paidBack.from === paidBack.to}
            onClick={() => { actions.paidBack(paidBack.from, paidBack.to, paidBackMinor); setPaidBack(null); }}>
            Record {money(paidBackMinor, tally.currency)}
          </Button>
        </Sheet>
      )}

      {naming && (
        <Sheet title={naming.kind === "add" ? "Add someone" : "Name this tally"} onClose={() => setNaming(null)}>
          <Field label={naming.kind === "add" ? "Their name" : "Name"} value={naming.text} maxLength={50} autoFocus
            placeholder={naming.kind === "add" ? "" : "Padel crew"} onChange={e => setNaming(x => ({ ...x, text: e.target.value }))}
            hint={naming.kind === "add" ? "They join by opening any link from this tally and picking their name." : "Everyone in the tally sees it."} />
          <Button disabled={naming.kind === "add" ? !naming.text.trim() : naming.text.trim() === (tallyName(tally) ?? "")}
            onClick={() => { (naming.kind === "add" ? actions.addPerson : actions.rename)(naming.text); setNaming(null); }}>
            {naming.kind === "add" ? "Add" : naming.text.trim() ? "Save" : "Remove the name"}
          </Button>
        </Sheet>
      )}
    </>
  );
}
