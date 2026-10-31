// The tally screen (docs/v2.0.md §9.4): whose turn it is, without euro signs.
import { CATEGORIES } from "../categories.js";
import { balance, dayNumber, openDisputes } from "../tally.js";
import { unsharedCount } from "../app.js";
import { hero, nameOf, othersLabel, payments, dayLabel } from "./format.js";
import { Button, Icon, TopBar, ICON_BUTTON } from "./components.jsx";
import { C, S } from "./theme.js";

const FULL_LEAN = 12;   // the bar leans all the way at 12× the "about even" amount (€60 by default)

/** A bar that leans toward whoever is ahead: me on the left, the other person on the right. */
function Lean({ tally }) {
  if (tally.members.length !== 2) return null;
  const mine = balance(tally)[tally.me.member];
  const lean = Math.max(-1, Math.min(1, mine / (tally.aboutEven * FULL_LEAN)));
  const other = tally.members.find(m => m.id !== tally.me.member).name;
  return (
    <div aria-hidden="true" style={{ marginTop: 14 }}>
      <div style={{ position: "relative", height: 6, background: C.field, borderRadius: 3 }}>
        <div style={{ position: "absolute", left: "50%", top: -3, width: 2, height: 12, background: C.fieldBorder }} />
        <div style={{ position: "absolute", top: 0, height: 6, borderRadius: 3, background: C.accent,
          left: lean < 0 ? "50%" : `${50 - lean * 50}%`, width: `${Math.abs(lean) * 50}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginTop: 6 }}>
        <span>You</span><span>{other}</span>
      </div>
    </div>
  );
}

export default function TallyView({ tally, onBack, onLog, onDetails, onShare, onWelcome }) {
  const h = hero(tally);
  const today = dayNumber();
  const unshared = unsharedCount(tally);
  const waitingOnMe = openDisputes(tally).filter(d => tally.writers[d.r[0]]?.member === tally.me.member);
  const recent = payments(tally).slice(0, 8);
  const others = othersLabel(tally);

  return (
    <>
      <TopBar title={others} onBack={onBack}
        right={<button type="button" onClick={onDetails} aria-label="Details and exact amounts"
          style={{ ...ICON_BUTTON, color: C.soft }}><Icon name="receipt_long" /></button>} />

      {tally.v1 && !tally.local?.welcomeAnswered && (
        <section style={{ ...S.card, borderColor: C.accentBorder }}>
          <h2 style={S.h2}>Your tally with {others} came along</h2>
          <p style={{ ...S.muted, marginTop: 6 }}>All your Schplitz 1 entries are here; the exact amounts are in Details. Did you already square up for this tally?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <Button onClick={() => onWelcome(true)}>Yes, start fresh from here</Button>
            <Button variant="secondary" onClick={() => onWelcome(false)}>No, keep the balance</Button>
          </div>
          <p style={{ ...S.muted, marginTop: 10, fontSize: 12 }}>Old entries are filed under Something else. You can sort them in Details.</p>
        </section>
      )}

      <section style={{ ...S.card, padding: "22px 18px" }}>
        <p style={{ ...S.h1, fontSize: 28 }}>{h.title}</p>
        <p style={{ ...S.muted, fontSize: 15, marginTop: 6, color: C.soft }}>{h.sub}</p>
        <Lean tally={tally} />
      </section>

      {waitingOnMe.length > 0 && (
        <button type="button" onClick={onDetails}
          style={{ ...S.card, borderColor: C.other, color: C.text, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="help" style={{ color: C.other }} />
          <span style={{ flex: 1, fontSize: 14 }}>
            {waitingOnMe.length === 1 ? `${nameOf(tally, tally.writers[waitingOnMe[0].w].member)} has a question about one of your payments`
              : `${waitingOnMe.length} questions about your payments`}
          </span>
          <Icon name="chevron_right" />
        </button>
      )}

      <Button icon="add" onClick={onLog} style={{ padding: 16, fontSize: 16 }}>I paid</Button>
      <Button variant="secondary" icon="share" onClick={onShare}>
        {unshared > 0 ? `Share with ${others} · ${unshared} not shared yet` : `Share with ${others}`}
      </Button>
      {tally.v1 && !tally.local?.handshakeSent && (
        <p style={S.muted}>Share once so {others}'s phone can match your old history with theirs.</p>
      )}

      <h2 style={S.sectionLabel}>Recent</h2>
      {recent.length === 0 ? <p style={S.muted}>Nothing yet. Tap “I paid” after you've treated {others}.</p> : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {recent.map(p => (
            <li key={`${p.w}:${p.s}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C.cardBorder}` }}>
              <span style={{ color: p.payer === tally.me.member ? C.accent : C.other, display: "flex" }}><Icon name={CATEGORIES[p.k]?.icon ?? "more_horiz"} size={22} /></span>
              <span style={{ flex: 1, fontSize: 14 }}>{p.payer === tally.me.member ? "You" : nameOf(tally, p.payer)} · {
                p.k === 0 && tally.v1?.notes?.[p.l] ? `“${tally.v1.notes[p.l]}”` : CATEGORIES[p.k]?.name ?? "Something else"}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{dayLabel(p.day, today)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
