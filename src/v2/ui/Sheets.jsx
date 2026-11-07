// Sheets over the tally screen: sharing, reviewing what arrived, sorting old entries.
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, TILE_ORDER } from "../categories.js";
import { usualAmount, QUERY_REASONS } from "../tally.js";
import { prepareShare, prepareFullCopy, fullCopyFile } from "../app.js";
import { LINK_BUDGET } from "../link.js";
import { errorText, money, nameOf, othersLabel, tallyTitle, payments, shareMessage, INVITE_MESSAGE, QUERY_CHIPS } from "./format.js";
import { qrPath } from "./qr.js";
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
  const [showQr, setShowQr] = useState(false);
  const qr = useMemo(() => (link ? qrPath(link.url) : null), [link]);   // null when the link is too long to scan
  const text = request.message ?? (request.invite ? INVITE_MESSAGE : shareMessage(tally, request.lastCategory));
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
    prepareShare(tally, cryptoKey, { origin }).then(l => { if (!cancelled) setLink(l); }, e => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [tally, cryptoKey, origin]);

  async function share() {
    try {
      await navigator.share({ title: "Schplitz", text, url: link.url });
      await onShared(link);
    } catch (err) {
      if (err?.name !== "AbortError") setError(err);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${text}\n${link.url}`);
      await onShared(link);
      setCopied(true);
    } catch (err) { setError(err); }
  }

  return (
    <Sheet title={request.invite ? `Invite ${othersLabel(tally)}` : `Share with ${tally.members.length > 2 ? "the group" : othersLabel(tally)}`} onClose={onClose}>
      <p style={{ ...S.muted, fontSize: 14, color: C.soft }}>“{text}”</p>
      {link?.full && <p style={S.muted}>This first link includes your old history, so it's longer than usual.</p>}
      {canShare && <Button icon="share" disabled={!link} onClick={share}>{link ? "Share" : "Preparing…"}</Button>}
      <Button variant={canShare ? "secondary" : "primary"} disabled={!link} onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
      {link && !canShare && (
        <textarea readOnly aria-label="Link" value={link.url} onFocus={e => e.target.select()}
          style={{ ...S.input, fontSize: 12, minHeight: 70, resize: "none", color: C.muted }} />
      )}
      {qr && (
        <Button variant="ghost" icon="qr_code_2" aria-expanded={showQr} onClick={() => setShowQr(v => !v)}>{showQr ? "Hide QR code" : "Show QR code"}</Button>
      )}
      {qr && showQr && (
        <figure style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <svg role="img" aria-label="QR code of the link" viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges"
            style={{ width: "min(100%, 300px)", background: "#fff", borderRadius: 8 }}>
            <path d={qr.path} fill="#000" />
          </svg>
          <figcaption style={S.muted}>Point the other phone's camera at this.</figcaption>
        </figure>
      )}
      {error && <p role="alert" style={{ color: C.danger, fontSize: 13, margin: 0 }}>{error.code ? errorText(error) : "Couldn't share. Copy the link instead."}</p>}
      {!request.invite && <Button variant="ghost" onClick={onClose}>Later</Button>}
    </Sheet>
  );
}

/** What arrived in a link: new payments that include me, and v1 differences (docs §3.5, migration step 4). */
export function Review({ tally, report, onNotMe, onAsk, onFullCopy, onClose }) {
  const [done, setDone] = useState(new Set());
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acted, setActed] = useState(false);   // raised a "Not me" or question: offer to share afterwards
  const close = () => onClose(acted);
  const items = report.involvingMe.filter(e => !done.has(`${e.w}:${e.s}`));
  const finish = (e) => setDone(d => new Set(d).add(`${e.w}:${e.s}`));
  async function respond(entry, action) {
    if (busy) return;
    setBusy(true);
    try {
      if (await action()) { setActed(true); finish(entry); setAsking(null); }
    } finally { setBusy(false); }
  }
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
                {QUERY_REASONS.map(r => <Chip key={r} on={false} disabled={busy} onClick={() => respond(e, () => onAsk(e, r))}>{QUERY_CHIPS[r]}</Chip>)}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <Button variant="secondary" style={{ flex: 1, padding: 10, fontSize: 13 }} onClick={() => finish(e)}>Looks right</Button>
                <Button variant="secondary" style={{ flex: 1, padding: 10, fontSize: 13 }} disabled={busy} onClick={() => respond(e, () => onNotMe(e))}>Not me</Button>
                <Button variant="secondary" style={{ flex: 1, padding: 10, fontSize: 13 }} onClick={() => setAsking(e)}>Ask about it</Button>
              </div>
            )}
          </section>
        );
      })}
      {report.involvingMe.length > 0 && items.length === 0 && <p style={S.muted}>All checked.</p>}
      {report.replaced.map(r => (
        <p key={r.writer} style={S.muted}>
          {nameOf(tally, tally.writers[r.writer]?.member)}'s phone sent its copy of your old tally.
          {r.added.length || r.removed.length ? ` ${r.added.length} ${r.added.length === 1 ? "entry" : "entries"} added, ${r.removed.length} removed.` : " It matches yours."}
        </p>
      ))}
      {report.review.map(r => r.theyMiss.length > 0 && (
        <p key={r.writer} style={S.muted}>{othersLabel(tally)}'s phone was missing {r.theyMiss.length} of your old entries. They're still here.</p>
      ))}
      {report.newPhones.map(m => (
        <section key={m} style={{ ...S.card, background: C.field }}>
          <p style={{ margin: 0, fontSize: 14 }}>{nameOf(tally, m)} is using a new phone.</p>
          <p style={{ ...S.muted, marginTop: 4 }}>Their balance is already there. Send a full copy if they want the older history too.</p>
          <Button variant="secondary" icon="download" style={{ marginTop: 10 }} onClick={onFullCopy}>Send a full copy</Button>
        </section>
      ))}
      {report.conflicts.length > 0 && (
        <p style={{ ...S.muted, color: C.danger }}>Something in this link doesn't match this phone. Ask {othersLabel(tally)} to share again. If it keeps happening, send each other a full copy.</p>
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

/**
 * A full copy as a file (docs §3.7): for a new or wiped phone ("send"), or as a backup
 * in Files ("backup"). The file holds the link, so opening it is opening the link.
 * onDone() after the file was shared or downloaded.
 */
export function FullCopySheet({ tally, cryptoKey, origin, mode, onDone, onClose }) {
  const [file, setFile] = useState(null);
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    prepareFullCopy(tally, cryptoKey, { origin }).then(l => {
      if (cancelled) return;
      setLink(l);
      setFile(fullCopyFile(tallyTitle(tally), l.url));
    }, e => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [tally, cryptoKey, origin]);

  const canShareFile = Boolean(file) && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  async function shareFile() {
    try { await navigator.share({ files: [file], title: "Schplitz full copy" }); await onDone(link); }
    catch (err) { if (err?.name !== "AbortError") setError(err); }
  }
  async function download() {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    try { await onDone(link); } catch (err) { setError(err); }
  }

  return (
    <Sheet title={mode === "backup" ? "Save a backup" : "Send a full copy"} onClose={onClose}>
      <p style={{ ...S.muted, fontSize: 14 }}>
        {mode === "backup"
          ? "Save it in Files, preferably in iCloud Drive. If you ever need it, open Schplitz, tap Open a full copy and type the answer."
          : "Send it to whoever needs the full history. They open Schplitz, tap Open a full copy and type the answer."}
      </p>
      {canShareFile && <Button icon="share" onClick={shareFile}>Share the file</Button>}
      <Button variant={canShareFile ? "secondary" : "primary"} icon="download" disabled={!file} onClick={download}>{file ? "Download the file" : "Preparing…"}</Button>
      {link && link.length <= LINK_BUDGET && (
        <p style={S.muted}>A normal link would also do here. Any link brings back the balance and the last 30 days.</p>
      )}
      {error && <p role="alert" style={{ color: C.danger, fontSize: 13, margin: 0 }}>{error.code ? errorText(error) : "Couldn't make the file. Try again."}</p>}
    </Sheet>
  );
}
