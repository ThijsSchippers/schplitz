// Sheets over the tally screen: sharing, reviewing what arrived, sorting old entries.
import { useEffect, useState } from "react";
import { CATEGORIES, TILE_ORDER } from "../categories.js";
import { usualAmount, QUERY_REASONS } from "../tally.js";
import { prepareShare } from "../app.js";
import { money, nameOf, othersLabel, payments, shareMessage, inviteMessage, QUERY_LABELS } from "./format.js";
import { Button, Chip, Icon, Sheet } from "./components.jsx";
import { C, S } from "./theme.js";

/**
 * Prepares the link when it opens, so the Share tap can call navigator.share
 * straight away (Safari only allows it directly in response to a tap).
 * request: { invite?, lastCategory?, message? }. onShared(link) after sharing or copying.
 */
export function ShareSheet({ tally, cryptoKey, origin, request, onShared, onClose }) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const text = request.message ?? (request.invite ? inviteMessage(tally) : shareMessage(tally, request.lastCategory));
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
    prepareShare(tally, cryptoKey, { origin }).then(l => { if (!cancelled) setLink(l); }, e => setError(e));
    return () => { cancelled = true; };
  }, [tally, cryptoKey, origin]);

  async function share() {
    try {
      await navigator.share({ title: "Schplitz", text, url: link.url });
      onShared(link);
    } catch (err) {
      if (err?.name !== "AbortError") setError(err);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text}\n${link.url}`);
      setCopied(true);
      onShared(link);
    } catch { setError(new Error("copy")); }
  }

  return (
    <Sheet title={request.invite ? `Invite ${othersLabel(tally)}` : `Share with ${othersLabel(tally)}`} onClose={onClose}>
      <p style={{ ...S.muted, fontSize: 14, color: C.soft }}>“{text}”</p>
      {link?.full && <p style={S.muted}>This first link includes your old history, so it's longer than usual.</p>}
      {canShare && <Button icon="share" disabled={!link} onClick={share}>{link ? "Share" : "Preparing…"}</Button>}
      <Button variant={canShare ? "secondary" : "primary"} disabled={!link} onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
      {link && !canShare && (
        <textarea readOnly aria-label="Link" value={link.url} onFocus={e => e.target.select()}
          style={{ ...S.input, fontSize: 12, minHeight: 70, resize: "none", color: C.muted }} />
      )}
      {error && <p role="alert" style={{ color: C.danger, fontSize: 13, margin: 0 }}>Couldn't share. Copy the link instead.</p>}
      {!request.invite && <Button variant="ghost" onClick={onClose}>Later</Button>}
    </Sheet>
  );
}

/** What arrived in a link: new payments that include me, and v1 differences (docs §3.5, migration step 4). */
export function Review({ tally, report, onNotMe, onAsk, onClose }) {
  const [done, setDone] = useState(new Set());
  const [asking, setAsking] = useState(null);
  const [acted, setActed] = useState(false);   // raised a "Not me" or question: offer to share afterwards
  const close = () => onClose(acted);
  const items = report.involvingMe.filter(e => !done.has(`${e.w}:${e.s}`));
  const finish = (e) => setDone(d => new Set(d).add(`${e.w}:${e.s}`));
  const sender = report.newEntries[0] ? nameOf(tally, tally.writers[report.newEntries[0].w]?.member) : othersLabel(tally);

  return (
    <Sheet title={report.involvingMe.length ? `New from ${sender}` : "Update"} onClose={close}>
      {items.map(e => {
        const usual = usualAmount(tally, e.k);
        const high = usual && e.v > usual * 2;
        return (
          <section key={`${e.w}:${e.s}`} style={{ ...S.card, background: C.field, borderColor: high ? C.accentBorder : C.fieldBorder }}>
            <div style={S.row}>
              <Icon name={CATEGORIES[e.k]?.icon ?? "more_horiz"} style={{ color: C.other }} />
              <span style={{ flex: 1 }}>{CATEGORIES[e.k]?.name ?? "Something else"} · {money(e.v, tally.currency)}</span>
            </div>
            <p style={{ ...S.muted, marginTop: 4 }}>
              {e.p.length === 2 ? "Split between you two" : `Split ${e.p.length} ways, including you`}{high ? " · more than usual" : ""}
            </p>
            {asking === e ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {QUERY_REASONS.map(r => <Chip key={r} on={false} onClick={() => { onAsk(e, r); setActed(true); finish(e); setAsking(null); }}>{QUERY_LABELS[r].replace(/^(the|a possible) /, "")}</Chip>)}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <Button variant="secondary" style={{ flex: 1, padding: 10, fontSize: 13 }} onClick={() => finish(e)}>Looks right</Button>
                <Button variant="secondary" style={{ flex: 1, padding: 10, fontSize: 13 }} onClick={() => { onNotMe(e); setActed(true); finish(e); }}>Not me</Button>
                <Button variant="secondary" style={{ flex: 1, padding: 10, fontSize: 13 }} onClick={() => setAsking(e)}>Ask about it</Button>
              </div>
            )}
          </section>
        );
      })}
      {report.involvingMe.length > 0 && items.length === 0 && <p style={S.muted}>All checked.</p>}
      {report.replaced.map(r => (
        <p key={r.writer} style={S.muted}>
          {nameOf(tally, tally.writers[r.writer]?.member)}'s phone sent its own version of your old tally
          {r.added.length || r.removed.length ? `: ${r.added.length} added, ${r.removed.length} removed.` : ". It matches yours."}
        </p>
      ))}
      {report.review.map(r => r.theyMiss.length > 0 && (
        <p key={r.writer} style={S.muted}>{othersLabel(tally)}'s phone didn't have {r.theyMiss.length} of your old entries. They're kept.</p>
      ))}
      {report.conflicts.length > 0 && (
        <p style={{ ...S.muted, color: C.danger }}>Something in this link doesn't match what this phone has. Ask {othersLabel(tally)} to share again; if it keeps happening, exchange full copies.</p>
      )}
      <Button onClick={close}>Done</Button>
    </Sheet>
  );
}

/** Sorting old entries (migration doc, step 2b): one tap sorts every entry with the same old text. */
export function SortOld({ tally, onSort, onClose }) {
  const groups = (() => {
    const byText = new Map();
    for (const p of payments(tally))
      if (p.legacy && !p.provisional && p.payer === tally.me.member) {
        const text = tally.v1?.notes?.[p.l] ?? "(no description)";
        if (!byText.has(text)) byText.set(text, []);
        byText.get(text).push(p);
      }
    return [...byText.entries()].sort((a, b) => b[1].length - a[1].length);
  })();

  return (
    <Sheet title="Sort old entries" onClose={onClose}>
      <p style={S.muted}>Your Schplitz 1 entries, grouped by what you wrote. Tap a category to sort a whole group.</p>
      {groups.map(([text, list]) => {
        const current = list.every(p => p.k === list[0].k) ? list[0].k : null;
        return (
          <section key={text} style={{ ...S.card, background: C.field }}>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}>“{text}” <span style={{ color: C.muted }}>· {list.length}</span></p>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {TILE_ORDER.map(k => (
                <button key={k} type="button" aria-label={CATEGORIES[k].name} aria-pressed={current === k}
                  onClick={() => onSort(list.map(p => [p.w, p.s]), k)}
                  style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    background: current === k ? C.accentTint : C.card, border: `1px solid ${current === k ? C.accentBorder : C.cardBorder}`, color: current === k ? C.accent : C.soft }}>
                  <Icon name={CATEGORIES[k].icon} size={20} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <Button onClick={onClose}>Done</Button>
    </Sheet>
  );
}
