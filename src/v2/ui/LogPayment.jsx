// The logging screen (docs/v2.0.md §6.2): tap a category, tap the amount, tap Add.
import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "../categories.js";
import { CURRENCIES } from "../../utils.js";
import { usualAmount, dayNumber } from "../tally.js";
import { decimalsOf, dayOfIsoDate, isoOfDay } from "../encoding.js";
import { defaultCurrency, recentCurrencies, valueInTallyCurrency } from "../app.js";
import { pressKey, fitDecimals, textOfMinor, typedOfMinor, minorOfText, displayTyped, decimalSeparator, keyFromKeyboard } from "./numpad.js";
import { money, locale, addLabel } from "./format.js";
import { Button, Chip, Icon, Numpad, Sheet, Tiles, ICON_BUTTON } from "./components.jsx";
import { C, S, FONT } from "./theme.js";

/**
 * initial: for editing, { category, amount, currency, paidOn }.
 * onSubmit({ category, amount, currency, paidOn }) may be async; errors are shown by the caller.
 */
export default function LogPayment({ tally, initial, onSubmit, onCancel, rateFor }) {
  const loc = locale();
  const today = dayNumber();
  const editing = Boolean(initial);
  const [category, setCategory] = useState(initial?.category ?? null);
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency(tally));
  const decimals = decimalsOf(currency);
  // Editing starts from the amount as it would have been typed ("24", not "24.00"), so backspace works naturally.
  const [amount, setAmount] = useState(initial ? { text: typedOfMinor(initial.amount, decimals), suggested: false } : { text: "", suggested: false });
  const [day, setDay] = useState(initial?.paidOn ?? today);
  const [pickDate, setPickDate] = useState(initial ? initial.paidOn < today - 1 : false);
  const [moreCurrencies, setMoreCurrencies] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const minor = minorOfText(amount.text, decimals);
  const canSubmit = category !== null && minor > 0 && !busy;

  function chooseCategory(k) {
    setCategory(k);
    if (editing || (amount.text && !amount.suggested)) return;
    const usual = currency === tally.currency ? usualAmount(tally, k) : null;
    setAmount(usual ? { text: textOfMinor(usual, decimals), suggested: true } : { text: "", suggested: false });
  }

  function chooseCurrency(c) {
    setCurrency(c);
    setMoreCurrencies(false);
    setAmount(a => (a.suggested ? { text: "", suggested: false } : { ...a, text: fitDecimals(a.text, decimalsOf(c)) }));
  }

  const press = (key) => setAmount(a => pressKey(a, key, decimals));

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try { await onSubmit({ category, amount: minor, currency, paidOn: day }); } finally { setBusy(false); }
  }

  // Hardware keyboard: digits, separators, Backspace, Enter = Add, Escape = close.
  const latest = useRef({});
  latest.current = { press, submit, onCancel, moreCurrencies };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || latest.current.moreCurrencies) return;
      const k = keyFromKeyboard(e.key);
      if (k) { e.preventDefault(); latest.current.press(k); }
      else if (e.key === "Enter") { e.preventDefault(); latest.current.submit(); }
      else if (e.key === "Escape") latest.current.onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The value in the tally currency, for a foreign amount.
  useEffect(() => {
    if (currency === tally.currency || minor <= 0) { setPreview(null); return undefined; }
    let cancelled = false;
    valueInTallyCurrency(tally, minor, currency, day, rateFor).then(r => { if (!cancelled) setPreview(r); }, () => {});
    return () => { cancelled = true; };
  }, [tally, minor, currency, day, rateFor]);

  const chips = [...new Set([tally.currency, ...recentCurrencies(tally), currency])];
  const caption = amount.suggested ? `usual for ${CATEGORIES[category].name} · type to change`
    : preview ? `≈ ${money(preview.value, tally.currency, loc)} · ${preview.estimated ? "estimated rate" : "rate locked when added"}`
    : " ";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: "calc(100dvh - 44px)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40 }}>
        <button type="button" onClick={onCancel} aria-label="Close" style={{ ...ICON_BUTTON, color: C.muted }}>
          <Icon name="close" />
        </button>
        <h1 style={{ ...S.h2, flex: 1, textAlign: "center" }}>{editing ? "Change payment" : "I paid"}</h1>
        <label style={{ display: "flex", alignItems: "center", gap: 5, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 999, padding: "4px 10px", color: C.soft, fontSize: 13 }}>
          <Icon name="calendar_today" size={15} />
          <select value={pickDate ? "earlier" : String(today - day)} aria-label="Payment date"
            onChange={e => { const v = e.target.value; if (v === "earlier") setPickDate(true); else { setPickDate(false); setDay(today - Number(v)); } }}
            style={{ background: "transparent", color: C.soft, border: "none", fontSize: 13, fontFamily: FONT, outline: "none" }}>
            <option value="0">Today</option>
            <option value="1">Yesterday</option>
            <option value="earlier">Earlier…</option>
          </select>
        </label>
      </header>
      {pickDate && (
        <input type="date" aria-label="Pick the payment date" value={isoOfDay(day)} max={isoOfDay(today)}
          onChange={e => e.target.value && setDay(dayOfIsoDate(e.target.value))} style={{ ...S.input, padding: "8px 12px" }} />
      )}

      <Tiles value={category} onChange={chooseCategory} />

      <div style={{ textAlign: "center", margin: "6px 0 2px" }} aria-live="polite">
        <div style={{ fontSize: 38, fontWeight: 650, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums", color: amount.suggested || !amount.text ? C.muted : C.text }}>
          {displayTyped(amount.text, currency, loc)}
        </div>
        <div style={{ fontSize: 12, color: C.muted, minHeight: 15 }}>{caption}</div>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
        {chips.map(c => <Chip key={c} on={c === currency} onClick={() => chooseCurrency(c)}>{c}</Chip>)}
        <Chip on={false} onClick={() => setMoreCurrencies(true)}>More <Icon name="keyboard_arrow_down" size={16} /></Chip>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 10 }}>
        <Numpad onKey={press} separator={decimalSeparator(loc)} decimalsAllowed={decimals > 0} />
        <Button onClick={submit} disabled={!canSubmit}>{busy ? "Saving…" : editing ? "Save changes" : category === null ? "Pick a category" : addLabel(category)}</Button>
      </div>

      {moreCurrencies && (
        <Sheet title="Currency" onClose={() => setMoreCurrencies(false)}>
          {Object.entries(CURRENCIES).map(([code, { name }]) => (
            <Button key={code} variant={code === currency ? "primary" : "secondary"} onClick={() => chooseCurrency(code)} style={{ justifyContent: "space-between" }}>
              <span>{name}</span><span>{code}</span>
            </Button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
