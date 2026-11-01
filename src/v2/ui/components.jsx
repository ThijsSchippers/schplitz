// Shared building blocks for the v2 screens.
import { useEffect, useId, useRef, useState } from "react";
import { ICON_PATHS } from "./icons.js";
import { CATEGORIES, TILE_ORDER, OTHER } from "../categories.js";
import { C, S, FONT } from "./theme.js";

const LONG_PRESS_MS = 600;   // holding backspace this long clears the amount
export const ICON_BUTTON = { background: "none", border: "none", cursor: "pointer", display: "flex", padding: 10, margin: -4 };   // ≥ 44px tap target

export function Icon({ name, size = 24, style }) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }}>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const BUTTON = {
  base: { border: "none", borderRadius: 12, padding: "13px 16px", fontSize: 15, fontWeight: 650, fontFamily: FONT, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" },
  primary: { background: C.accent, color: C.onAccent },
  secondary: { background: C.card, color: C.text, border: `1px solid ${C.cardBorder}` },
  ghost: { background: "transparent", color: C.soft, border: `1px solid ${C.fieldBorder}` },
  danger: { background: "transparent", color: C.danger, border: `1px solid ${C.danger}55` },
};

export function Button({ variant = "primary", icon, children, style, disabled, ...rest }) {
  return (
    <button type="button" disabled={disabled} style={{ ...BUTTON.base, ...BUTTON[variant], ...(disabled ? { opacity: 0.4, cursor: "not-allowed" } : {}), ...style }} {...rest}>
      {icon && <Icon name={icon} size={20} />}{children}
    </button>
  );
}

export function TopBar({ title, onBack, right }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back" style={{ ...ICON_BUTTON, color: C.soft }}>
          <Icon name="arrow_back" />
        </button>
      )}
      <h1 style={{ ...S.h2, flex: 1, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h1>
      {right}
    </header>
  );
}

/** A labelled input. The hint is announced as the input's description, not as part of its name. */
/**
 * A labelled text input. hint: a line under the input. info: an explanation behind an
 * info button next to the label; screen readers get it as the input's description either way.
 */
export function Field({ label, hint, info, ...input }) {
  const id = useId();
  const [showInfo, setShowInfo] = useState(false);
  const describedBy = [hint && `${id}-hint`, info && `${id}-info`].filter(Boolean).join(" ") || undefined;
  return (
    <div style={S.label}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <label htmlFor={id}>{label}</label>
        {info && (
          <button type="button" aria-label="More info" aria-expanded={showInfo} aria-controls={`${id}-info`} onClick={() => setShowInfo(v => !v)}
            style={{ ...ICON_BUTTON, padding: 13, margin: "-13px -9px", color: showInfo ? C.accent : C.muted }}>
            <Icon name="info" size={18} />
          </button>
        )}
      </span>
      {info && (
        <span id={`${id}-info`} hidden={!showInfo} style={{ fontSize: 13, color: C.soft, background: C.field, borderRadius: 10, padding: "8px 10px" }}>{info}</span>
      )}
      <input id={id} style={S.input} aria-describedby={describedBy} {...input} />
      {hint && <span id={`${id}-hint`} style={{ fontSize: 12, color: C.muted }}>{hint}</span>}
    </div>
  );
}

/**
 * A panel over the screen. Escape and the backdrop close it. Focus moves into the
 * panel when it opens and back to where it was when it closes.
 */
export function Sheet({ title, onClose, children }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") close.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 20 }}>
      <div ref={panel} tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ ...S.card, width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "18px 16px 24px", display: "flex", flexDirection: "column", gap: 12, maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={S.row}>
          <h2 style={{ ...S.h2, flex: 1, outline: "none" }}>{title}</h2>
          {onClose && <button type="button" onClick={onClose} aria-label="Close" style={{ ...ICON_BUTTON, color: C.muted }}><Icon name="close" /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div role={toast.error ? "alert" : "status"} aria-live={toast.error ? "assertive" : "polite"}
      style={{ position: "fixed", top: 62, left: "50%", transform: "translateX(-50%)", zIndex: 30, maxWidth: "calc(100% - 32px)",
        background: toast.error ? C.dangerFill : C.card, border: `1px solid ${toast.error ? C.dangerFill : C.cardBorder}`, color: C.text,
        padding: "10px 16px", borderRadius: 12, fontSize: 14, boxShadow: "0 6px 24px #0008" }}>
      {toast.text}
    </div>
  );
}

/** The category tiles: a 5 × 2 grid plus "Something else" (docs §6.2.1). */
export function Tiles({ value, onChange }) {
  const tile = (k) => {
    const c = CATEGORIES[k], on = value === k;
    return (
      <button key={k} type="button" aria-pressed={on} aria-label={c.name} onClick={() => onChange(k)}
        style={{ aspectRatio: "1 / 1", background: on ? C.accentTint : C.field, border: `1px solid ${on ? C.accentBorder : C.fieldBorder}`,
          borderRadius: 10, color: on ? C.accent : C.soft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 3, padding: 0, cursor: "pointer", fontFamily: FONT, minWidth: 0 }}>
        <Icon name={c.icon} size={24} />
        <span style={{ fontSize: 10, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
      </button>
    );
  };
  const otherOn = value === OTHER;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "clamp(4px, 1.5vw, 6px)" }}>{TILE_ORDER.map(tile)}</div>
      <button type="button" aria-pressed={otherOn} onClick={() => onChange(OTHER)}
        style={{ marginTop: 6, width: "100%", padding: 7, background: otherOn ? C.accentTint : "transparent", border: `1px dashed ${otherOn ? C.accentBorder : C.fieldBorder}`,
          borderRadius: 9, color: otherOn ? C.accent : C.muted, fontSize: 12.5, display: "flex", gap: 6, alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: FONT }}>
        <Icon name="more_horiz" size={16} /> Something else
      </button>
    </div>
  );
}

/** 3 × 4 numpad. onKey receives "0"–"9", "." or "back"; a long press on backspace clears. */
export function Numpad({ onKey, separator, decimalsAllowed }) {
  const timer = useRef(null);
  const stop = () => clearTimeout(timer.current);
  const key = (k, label, aria) => (
    <button key={k} type="button" aria-label={aria ?? label} disabled={k === "." && !decimalsAllowed}
      onClick={() => onKey(k)}
      onPointerDown={k === "back" ? () => { stop(); timer.current = setTimeout(() => onKey("clear"), LONG_PRESS_MS); } : undefined}
      onPointerUp={k === "back" ? stop : undefined}
      onPointerLeave={k === "back" ? stop : undefined}
      style={{ background: C.card, border: "none", borderRadius: 10, color: C.text, fontSize: 22, fontFamily: FONT, minHeight: 52,
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: k === "." && !decimalsAllowed ? 0.25 : 1 }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => key(d, d))}
      {key(".", separator, "Decimal separator")}
      {key("0", "0")}
      {key("back", <Icon name="backspace" size={22} />, "Delete")}
    </div>
  );
}

export function Chip({ on, children, ...rest }) {
  return (
    <button type="button" aria-pressed={on} {...rest}
      style={{ padding: "6px 12px", borderRadius: 999, background: on ? C.accentTint : C.field, border: `1px solid ${on ? C.accentBorder : C.fieldBorder}`,
        color: on ? C.accent : C.soft, fontSize: 13, fontWeight: 600, fontFamily: FONT, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
      {children}
    </button>
  );
}
