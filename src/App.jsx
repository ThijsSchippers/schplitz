import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const CURRENCIES = {
  EUR:{ symbol:"€",  name:"Euro" },
  USD:{ symbol:"$",  name:"US Dollar" },
  ALL:{ symbol:"L",  name:"Albanian Lek" },
  AED:{ symbol:"د.إ",name:"UAE Dirham" },
  NOK:{ symbol:"kr", name:"Norwegian Krone" },
  SEK:{ symbol:"kr", name:"Swedish Krona" },
  THB:{ symbol:"฿",  name:"Thai Baht" },
};
const FALLBACK_RATES = { EUR:1, USD:1.04, ALL:113.5, AED:3.82, NOK:11.80, SEK:11.45, THB:38.0 };
const TOAST_DURATION = 2400;

const STATUS_OPTIONS = [
  { value: "just_started",  label: "Just getting started" },
  { value: "almost_done",   label: "Almost done adding expenses" },
  { value: "done",          label: "Done adding expenses" },
];

const normalizeAnswer = (s) => s.toLowerCase().replace(/\s+/g, "");

async function compressToUrl(str) {
  const stream = new Blob([str]).stream();
  const compressed = stream.pipeThrough(new CompressionStream("deflate-raw"));
  const buf = await new Response(compressed).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function decompressFromUrl(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream();
  const decompressed = stream.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(decompressed).text();
}

const PBKDF2_ITERS = 200_000;

async function fetchRates() {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=EUR");
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.rates) return null;
    const o = { EUR:1 };
    for (const c of Object.keys(CURRENCIES)) if (c !== "EUR" && d.rates[c] != null) o[c] = d.rates[c];
    return o;
  } catch (err) { console.error("Failed to fetch exchange rates:", err); return null; }
}

function toEUR(amt, cur, rates) {
  if (cur === "EUR") return amt;
  return amt / (rates[cur] ?? FALLBACK_RATES[cur] ?? 1);
}

const I = {
  Plus:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Down:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Up:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Copy:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Chk:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  User:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="8" r="4"/></svg>,
  Settled: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Users:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Link:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
};

const fmt = (n, c) => {
  const s = (CURRENCIES[c] || CURRENCIES.EUR).symbol;
  const v = parseFloat(n);
  return isNaN(v) ? `${s}0.00` : `${s}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const uid = () => {
  const ts = Date.now().toString(36);
  const r1 = Math.random().toString(36).slice(2, 11);
  const r2 = Math.random().toString(36).slice(2, 6);
  return `${ts}-${r1}-${r2}`;
};

const today = () => new Date().toISOString().split("T")[0];

function validateExpense(e) {
  if (!e || typeof e !== "object") throw new Error("Expense must be an object");
  if (!e.id || typeof e.id !== "string") throw new Error("Invalid or missing expense ID");
  if (!e.description || typeof e.description !== "string" || !e.description.trim()) throw new Error("Invalid or missing description");
  if (typeof e.amount !== "number" || isNaN(e.amount) || e.amount < 0) throw new Error("Invalid expense amount");
  if (!e.currency || !CURRENCIES[e.currency]) throw new Error(`Unknown currency: ${e.currency}`);
  if (!e.paidBy || typeof e.paidBy !== "string" || !e.paidBy.trim()) throw new Error("Invalid or missing paidBy");
  if (!e.date || typeof e.date !== "string") throw new Error("Invalid or missing date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error("Invalid date format");
  return true;
}

async function deriveKey(pass, salt) {
  const b = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" }, b, 256);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(pt, pass) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(pass, salt);
    const buf  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pt));
    const out  = new Uint8Array(salt.length + iv.length + buf.byteLength);
    out.set(salt, 0); out.set(iv, salt.length); out.set(new Uint8Array(buf), salt.length + iv.length);
    return btoa(String.fromCharCode(...out));
  } catch (err) { console.error("Encryption failed:", err); throw err; }
}

async function decrypt(b64, pass) {
  try {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const key = await deriveKey(pass, raw.slice(0, 16));
    return new TextDecoder().decode(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(16, 28) }, key, raw.slice(28))
    );
  } catch (err) { console.error("Decryption failed:", err); throw err; }
}

// ─── EXPENSE TRACKER ─────────────────────────────────────────────────────────

function ExpenseTracker() {
  const [initialized, setInitialized]               = useState(false);
  const [myName, setMyName]                         = useState("");
  const [otherName, setOtherName]                   = useState("");
  const [securityQuestion, setSecurityQuestion]     = useState("");
  const [securityAnswer, setSecurityAnswer]         = useState("");
  const [myStatus, setMyStatus]                     = useState("just_started");
  const [otherStatus, setOtherStatus]               = useState(null);
  const [expenses, setExpenses]                     = useState([]);
  const [form, setForm]                             = useState({ description: "", amount: "", currency: "EUR", date: today() });
  const [showForm, setShowForm]                     = useState(false);
  const [toast, setToast]                           = useState(null);
  const [modal, setModal]                           = useState(null);

  const [setupMode, setSetupMode]                   = useState("choice");
  const [setupMyName, setSetupMyName]               = useState("");
  const [setupOtherName, setSetupOtherName]         = useState("");
  const [setupQuestion, setSetupQuestion]           = useState("");
  const [setupAnswer, setSetupAnswer]               = useState("");
  const [setupAnswerConfirm, setSetupAnswerConfirm] = useState("");
  const [importText, setImportText]                 = useState("");
  const [importAnswer, setImportAnswer]             = useState("");
  const [importing, setImporting]                   = useState(false);
  const [detectedQuestion, setDetectedQuestion]     = useState("");
  const [detectedNames, setDetectedNames]           = useState([]);

  const [exportStatus, setExportStatus]             = useState("just_started");
  const [exporting, setExporting]                   = useState(false);
  const [exportResult, setExportResult]             = useState("");
  const [exportIsUrl, setExportIsUrl]               = useState(false);
  const [copied, setCopied]                         = useState(false);

  const [rates, setRates]                           = useState(FALLBACK_RATES);
  const [rSrc, setRSrc]                             = useState("fallback");
  const [loadingRates, setLoadingRates]             = useState(true);

  const taRef = useRef(null);

  const answersMatch   = setupAnswer && setupAnswerConfirm && setupAnswer === setupAnswerConfirm;
  const answerMismatch = setupAnswer && setupAnswerConfirm && setupAnswer !== setupAnswerConfirm;

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#share=")) return;
    const compressed = hash.slice(7);
    (async () => {
      try {
        const json = await decompressFromUrl(compressed);
        const data = JSON.parse(json);
        if (data.v === 3) {
          setImportText(json);
          setDetectedQuestion(data.question || "");
          setDetectedNames(data.names || []);
          setSetupMode("import");
        }
      } catch (err) { console.error("Failed to parse share URL:", err); }
    })();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("schplitzExpenses");
    if (stored) {
      try {
        const p = JSON.parse(stored);
        if (p.initialized) {
          setMyName(p.myName || ""); setOtherName(p.otherName || "");
          setSecurityQuestion(p.securityQuestion || ""); setSecurityAnswer(p.securityAnswer || "");
          setMyStatus(p.myStatus || "just_started"); setOtherStatus(p.otherStatus || null);
          setExpenses(p.expenses || []); setInitialized(true);
        }
      } catch (err) { console.error("Failed to load from storage:", err); }
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;
    try {
      localStorage.setItem("schplitzExpenses", JSON.stringify({
        initialized: true, myName, otherName, securityQuestion,
        securityAnswer, myStatus, otherStatus, expenses
      }));
    } catch (err) { console.error("Failed to save:", err); }
  }, [initialized, myName, otherName, securityQuestion, securityAnswer, myStatus, otherStatus, expenses]);

  useEffect(() => {
    if (!importText.trim()) { setDetectedQuestion(""); setDetectedNames([]); return; }
    try {
      const o = JSON.parse(importText);
      if (o.v === 3) { setDetectedQuestion(o.question || ""); setDetectedNames(o.names || []); }
      else { setDetectedQuestion(""); setDetectedNames([]); }
    } catch { setDetectedQuestion(""); setDetectedNames([]); }
  }, [importText]);

  useEffect(() => {
    fetchRates()
      .then(l => { if (l) { setRates(l); setRSrc("live"); } })
      .finally(() => setLoadingRates(false));
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), TOAST_DURATION);
  }, []);

  const summary = useMemo(() => {
    if (!otherName) return null;
    let my = 0, ot = 0;
    expenses.forEach(e => {
      const eur = toEUR(e.amount, e.currency, rates);
      if (e.paidBy === myName) my += eur;
      else if (e.paidBy === otherName) ot += eur;
    });
    return { myTotal: my, otherTotal: ot, myBalance: my - (my + ot) / 2 };
  }, [expenses, myName, otherName, rates]);

  const addExpense = () => {
    if (!form.description.trim() || !form.amount) return;
    setExpenses(p => [{
      id: uid(), description: form.description.trim(),
      amount: parseFloat(form.amount), currency: form.currency,
      paidBy: myName, date: form.date
    }, ...p]);
    setForm({ description: "", amount: "", currency: form.currency, date: today() });
    setShowForm(false);
    showToast("Expense added");
  };

  const handleSetupNew = () => {
    if (!setupMyName.trim() || !setupOtherName.trim() || !setupQuestion.trim() || !answersMatch) {
      showToast("Please fill in all fields correctly", "error"); return;
    }
    setMyName(setupMyName.trim()); setOtherName(setupOtherName.trim());
    setSecurityQuestion(setupQuestion.trim()); setSecurityAnswer(setupAnswer);
    setMyStatus("just_started"); setOtherStatus(null); setExpenses([]);
    setInitialized(true); showToast("New tally started!");
  };

  const handleSetupImport = async () => {
    if (!importText.trim() || !importAnswer.trim() || !setupMyName.trim()) {
      showToast("Please fill in all fields", "error"); return;
    }
    setImporting(true);
    try {
      const o = JSON.parse(importText);
      if (!o.encrypted || o.v !== 3) throw new Error("Invalid import format");
      const normalizedAnswer = normalizeAnswer(importAnswer);
      const decrypted = await decrypt(o.encrypted, normalizedAnswer);
      const data = JSON.parse(decrypted);
      if (!Array.isArray(data.expenses)) throw new Error("Invalid data format");
      data.expenses.forEach((e, idx) => {
        try { validateExpense(e); }
        catch (err) { throw new Error(`Invalid expense at index ${idx}: ${err.message}`); }
      });
      const otherPersonName = (o.names || []).find(n => n !== setupMyName.trim()) || "";
      setMyName(setupMyName.trim()); setOtherName(otherPersonName);
      setSecurityQuestion(o.question || ""); setSecurityAnswer(normalizedAnswer);
      setMyStatus("just_started"); setOtherStatus(data.status || null);
      setExpenses(data.expenses || []); setInitialized(true);
      window.history.replaceState(null, "", window.location.pathname);
      showToast(`Imported ${data.expenses.length} expense${data.expenses.length !== 1 ? "s" : ""}!`);
    } catch (err) {
      console.error("Import failed:", err);
      showToast(err.name === "OperationError" ? "Wrong answer or corrupted data" : `Import failed: ${err.message}`, "error");
    }
    setImporting(false);
  };

  const handleExport = async () => {
    if (!expenses.length) { showToast("Nothing to export yet", "info"); return; }
    setExporting(true);
    try {
      const payload = {
        v: 3, question: securityQuestion, names: [myName, otherName],
        encrypted: await encrypt(JSON.stringify({
          expenses: expenses.map(e => ({ i: e.id, d: e.description, a: e.amount, c: e.currency, p: e.paidBy, t: e.date })),
          status: exportStatus
        }), securityAnswer)
      };
      const compressed = await compressToUrl(JSON.stringify(payload));
      const url = `${window.location.origin}${window.location.pathname}#share=${compressed}`;
      if (url.length > 8000) {
        showToast("Too many expenses for a URL — text export used instead", "info");
        setExportResult(JSON.stringify(payload, null, 2)); setExportIsUrl(false);
      } else {
        setExportResult(url); setExportIsUrl(true);
      }
      setMyStatus(exportStatus);
    } catch (err) { console.error("Export failed:", err); showToast("Export failed", "error"); }
    setExporting(false);
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(exportResult); }
    catch { if (taRef.current) { taRef.current.select(); document.execCommand("copy"); } }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
    showToast("Copied to clipboard");
  };

  const handlePasteImport = async (val) => {
    if (val.includes("#share=")) {
      const compressed = val.split("#share=")[1];
      try {
        const json = await decompressFromUrl(compressed);
        const data = JSON.parse(json);
        setImportText(json); setDetectedQuestion(data.question || ""); setDetectedNames(data.names || []);
      } catch { setImportText(val); }
    } else { setImportText(val); }
  };

  const resetEverything = () => {
    if (!window.confirm("This will delete all data and start over. Are you sure?")) return;
    setInitialized(false); setMyName(""); setOtherName(""); setSecurityQuestion(""); setSecurityAnswer("");
    setMyStatus("just_started"); setOtherStatus(null); setExpenses([]); setSetupMode("choice");
    localStorage.removeItem("schplitzExpenses");
    window.history.replaceState(null, "", window.location.pathname);
  };

  // ─── SETUP ───────────────────────────────────────────────────────────────

  if (!initialized) return (
    <div style={S.setupOverlay}>
      <div style={S.setupCard}>
        <div style={S.setupHeader}>
          <h2 style={S.setupTitle}>Welcome to Schplitz</h2>
          <p style={S.setupSub}>How would you like to start?</p>
        </div>

        {setupMode === "choice" && (
          <div style={S.choiceGrid}>
            <button onClick={() => setSetupMode("new")} style={S.choiceBtn}>
              <I.Users />
              <span style={S.choiceBtnTitle}>Start New Tally</span>
              <span style={S.choiceBtnDesc}>Begin tracking expenses with someone</span>
            </button>
            <button onClick={() => setSetupMode("import")} style={S.choiceBtn}>
              <I.Up />
              <span style={S.choiceBtnTitle}>Import Existing</span>
              <span style={S.choiceBtnDesc}>Open a share link or paste encrypted data</span>
            </button>
          </div>
        )}

        {setupMode === "new" && (
          <div style={S.setupForm}>
            <button onClick={() => setSetupMode("choice")} style={S.backLink}>Back</button>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Your name</label>
              <input autoFocus value={setupMyName} onChange={e => setSetupMyName(e.target.value)} placeholder="e.g., Alex" style={S.setupInput} />
            </div>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Other person's name</label>
              <input value={setupOtherName} onChange={e => setSetupOtherName(e.target.value)} placeholder="e.g., Jordan" style={S.setupInput} />
            </div>
            <div style={S.setupDivider} />
            <div style={S.setupField}>
              <label style={S.setupLabel}>Security question</label>
              <input value={setupQuestion} onChange={e => setSetupQuestion(e.target.value)} placeholder="e.g., Where did we meet?" style={S.setupInput} />
            </div>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Answer</label>
              <input type="password" value={setupAnswer}
                onChange={e => setSetupAnswer(e.target.value.toLowerCase().replace(/\s/g, ""))}
                placeholder="lowercase, no spaces"
                style={S.setupInput} />
              <span style={S.inputHint}>Lowercase only — no capitals, no spaces</span>
            </div>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Confirm answer</label>
              <input type="password" value={setupAnswerConfirm}
                onChange={e => setSetupAnswerConfirm(e.target.value.toLowerCase().replace(/\s/g, ""))}
                placeholder="Type it again"
                style={{ ...S.setupInput, ...(answerMismatch ? S.inputError : answersMatch ? S.inputOk : {}) }} />
              {answerMismatch && <span style={{ ...S.inputHint, color: "#e05555" }}>Answers do not match</span>}
              {answersMatch   && <span style={{ ...S.inputHint, color: "#4caf50" }}>Answers match</span>}
            </div>
            <button onClick={handleSetupNew}
              disabled={!setupMyName.trim() || !setupOtherName.trim() || !setupQuestion.trim() || !answersMatch}
              style={{ ...S.setupSubmit, ...(!setupMyName.trim() || !setupOtherName.trim() || !setupQuestion.trim() || !answersMatch ? S.disabled : {}) }}>
              Start Tracking
            </button>
          </div>
        )}

        {setupMode === "import" && (
          <div style={S.setupForm}>
            <button onClick={() => setSetupMode("choice")} style={S.backLink}>Back</button>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Paste share link or encrypted data</label>
              <textarea autoFocus value={importText} onChange={e => handlePasteImport(e.target.value.trim())}
                placeholder="Paste the share link or encrypted JSON here..." style={S.setupTextarea} />
            </div>
            {detectedQuestion && (
              <div style={S.detectedQ}><strong>Security Question:</strong> {detectedQuestion}</div>
            )}
            <div style={S.setupField}>
              <label style={S.setupLabel}>Answer</label>
              <input type="password" value={importAnswer}
                onChange={e => setImportAnswer(e.target.value.toLowerCase().replace(/\s/g, ""))}
                placeholder="lowercase, no spaces" style={S.setupInput} />
              <span style={S.inputHint}>Lowercase only — no capitals, no spaces</span>
            </div>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Your name</label>
              {detectedNames.length > 0 ? (
                <div style={S.nameButtons}>
                  {detectedNames.map(name => (
                    <button key={name} onClick={() => setSetupMyName(name)}
                      style={{ ...S.nameBtn, ...(setupMyName === name ? S.nameBtnActive : {}) }}>
                      {name}
                    </button>
                  ))}
                </div>
              ) : (
                <input value={setupMyName} onChange={e => setSetupMyName(e.target.value)} placeholder="Your name" style={S.setupInput} />
              )}
            </div>
            <button onClick={handleSetupImport}
              disabled={!importText.trim() || !importAnswer.trim() || !setupMyName.trim() || importing}
              style={{ ...S.setupSubmit, ...(!importText.trim() || !importAnswer.trim() || !setupMyName.trim() || importing ? S.disabled : {}) }}>
              {importing ? "Decrypting..." : "Import and Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ─── MAIN APP ─────────────────────────────────────────────────────────────

  const disabledStyle = { opacity: 0.35, cursor: "not-allowed" };

  return (
    <div style={S.root}>
      {toast && (
        <div style={{ ...S.toast, background: toast.type === "error" ? "#c0392b" : toast.type === "info" ? "#2980b9" : "#27ae60" }}>
          {toast.msg}
        </div>
      )}

      {modal === "export" && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <span style={S.modalTitle}>Export Expenses</span>
              <button onClick={() => setModal(null)} style={S.modalX}><I.X /></button>
            </div>
            {!exportResult ? (
              <>
                <p style={S.modalDesc}>Select your status then generate a shareable link for {otherName}.</p>
                <div style={S.statusGrid}>
                  {STATUS_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setExportStatus(opt.value)}
                      style={{ ...S.statusBtn, ...(exportStatus === opt.value ? S.statusBtnActive : {}) }}>
                      <span style={S.statusLabel}>{opt.label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={handleExport} disabled={exporting}
                  style={{ ...S.copyBtn, ...(exporting ? disabledStyle : {}) }}>
                  <I.Link /> {exporting ? "Generating..." : "Generate Share Link"}
                </button>
              </>
            ) : (
              <>
                <p style={{ ...S.modalDesc, marginBottom: 8 }}>
                  {exportIsUrl ? `Send this link to ${otherName}. All data is encrypted in the URL.` : "Too many expenses for a URL — copy this encrypted text instead."}
                </p>
                <textarea ref={taRef} readOnly value={exportResult}
                  style={{ ...S.expTA, ...(exportIsUrl ? { minHeight: 72, color: "#7ab8f5", fontSize: 11 } : {}) }} />
                <button onClick={handleCopy} style={S.copyBtn}>
                  {copied ? <><I.Chk /> Copied!</> : <><I.Copy /> {exportIsUrl ? "Copy Link" : "Copy Text"}</>}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <header style={S.header}>
        <span style={S.hdrName}><I.User /> {myName}</span>
        <button onClick={() => { setExportResult(""); setExportIsUrl(false); setExportStatus(myStatus); setModal("export"); }} style={S.hdrBtnExp}>
          <I.Down /> Export
        </button>
      </header>

      {summary && (
        <div style={S.sumWrap}>
          <div style={S.sumCard}>
            <div style={S.sumTop}>
              <span style={S.sumLabel}>Balance (EUR)</span>
              <div style={S.sumTopR}>
                {loadingRates
                  ? <span style={{ ...S.rBadge, color: "#888" }}>loading rates...</span>
                  : <span style={{ ...S.rBadge, color: rSrc === "live" ? "#4caf50" : "#e8a84d" }}>
                      {rSrc === "live" ? "live rates" : "fallback rates"}
                    </span>}
                {summary.myBalance === 0 && expenses.length > 0 &&
                  <span style={S.settledBadge}><I.Settled /> Settled</span>}
              </div>
            </div>
            <div style={S.statusRow}>
              <div style={S.statusItem}>
                <span style={S.statusPerson}>{myName}</span>
                <span style={S.statusBadge}>{STATUS_OPTIONS.find(s => s.value === myStatus)?.label}</span>
              </div>
              <div style={S.statusItem}>
                <span style={S.statusPerson}>{otherName}</span>
                <span style={S.statusBadge}>{otherStatus ? STATUS_OPTIONS.find(s => s.value === otherStatus)?.label : "No update yet"}</span>
              </div>
            </div>
            <div style={S.sumRow}>
              <div style={S.sumP}>
                <span style={S.sumPN}>{myName}</span>
                <span style={S.sumPA}>{fmt(summary.myTotal, "EUR")}</span>
              </div>
              <div style={S.sumDiv} />
              <div style={S.sumP}>
                <span style={S.sumPN}>{otherName}</span>
                <span style={S.sumPA}>{fmt(summary.otherTotal, "EUR")}</span>
              </div>
            </div>
            {summary.myBalance !== 0 && (
              <div style={S.owesRow}>
                {summary.myBalance > 0
                  ? <><span style={S.owesN}>{otherName}</span> owes <strong style={S.owesA}>{fmt(Math.abs(summary.myBalance), "EUR")}</strong> to <span style={S.owesN}>{myName}</span></>
                  : <><span style={S.owesN}>{myName}</span> owes <strong style={S.owesA}>{fmt(Math.abs(summary.myBalance), "EUR")}</strong> to <span style={S.owesN}>{otherName}</span></>}
              </div>
            )}
          </div>
        </div>
      )}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={S.addBtn}><I.Plus /> Add Expense</button>
      ) : (
        <div style={S.formCard}>
          <div style={S.fRow}>
            <input autoFocus placeholder="What was it for?" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...S.input, flex: 1 }} />
          </div>
          <div style={S.fRow}>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={{ ...S.input, width: 110 }} />
            <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} style={S.select}>
              {Object.entries(CURRENCIES).map(([c, { symbol, name }]) =>
                <option key={c} value={c}>{symbol} {c} — {name}</option>
              )}
            </select>
          </div>
          <div style={S.fRow}>
            <label style={S.label}>Date</label>
            <input type="date" value={form.date} max={today()}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ ...S.input, width: 160 }} />
          </div>
          <div style={S.fActs}>
            <button onClick={() => setShowForm(false)} style={S.cancelBtn}>Cancel</button>
            <button onClick={addExpense} disabled={!form.description.trim() || !form.amount}
              style={{ ...S.submitBtn, ...(!form.description.trim() || !form.amount ? disabledStyle : {}) }}>
              <I.Plus /> Add
            </button>
          </div>
        </div>
      )}

      <div style={S.listWrap}>
        {expenses.length === 0 ? (
          <div style={S.empty}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#3a3a4a" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            <p style={S.emptyT}>No expenses yet. Add one above.</p>
          </div>
        ) : expenses.map(e => (
          <div key={e.id} style={S.expItem}>
            <div style={S.expL}>
              <span style={{ ...S.expPB, ...(e.paidBy === myName ? S.pbMe : S.pbOt) }}>{e.paidBy}</span>
              <span style={S.expDesc}>{e.description}</span>
              <span style={S.expDate}>{e.date}</span>
            </div>
            <div style={S.expR}>
              <div style={S.expAmtG}>
                <span style={S.expAmt}>{fmt(e.amount, e.currency)}</span>
                {e.currency !== "EUR" && <span style={S.expAmtEur}>approx. {fmt(toEUR(e.amount, e.currency, rates), "EUR")}</span>}
              </div>
              <button onClick={() => setExpenses(p => p.filter(x => x.id !== e.id))} style={S.delBtn} title="Delete">
                <I.Trash />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        <button onClick={resetEverything} style={S.resetBtn}>Reset everything</button>
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────

function LandingPage({ onLaunch }) {
  return (
    <div style={L.page}>
      <nav style={L.nav}>
        <span style={L.logo}>schplitz</span>
        <button onClick={onLaunch} style={L.navCta}>Open App</button>
      </nav>

      {/* HERO — bar couple image sits right of copy */}
      <section style={L.hero}>
        <div style={L.glowA} />
        <div style={L.glowB} />
        <div style={L.heroInner}>
          <span style={L.eyebrow}>expense splitting, redesigned</span>
          <h1 style={L.heroH1}>
            Don't let your<br />purchase history<br />haunt <span style={L.accent}>your future.</span>
          </h1>
          <p style={L.heroP}>
            Schplitz keeps expenses on your device. Share them encrypted with one other person. No cloud, no tracking.
          </p>
          <div style={L.heroActs}>
            <button onClick={onLaunch} style={L.heroCta}>
              Start splitting
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
            <span style={L.heroNote}>No account. No sign-up. No cloud.</span>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
<section style={L.section}>
  <div style={L.sectionHead}>
    <span style={L.eyebrow}>the uncomfortable truth</span>
    <h2 style={L.sectionH2}>Most apps<br /><span style={L.accent}>know too much.</span></h2>
  </div>
  <div style={L.problemGrid}>
    <div style={L.probCard}>
      <img src="/images/city-night.jpg" alt="" style={L.probImg} loading="lazy" />
      <h3 style={L.probTitle}>Synced to the cloud</h3>
      <p style={L.probBody}>Every expense you log is uploaded to a server you don't own, run by a company you've never met.</p>
    </div>
    <div style={L.probCard}>
      <img src="/images/bar-friends.jpg" alt="" style={L.probImg} loading="lazy" />
      <h3 style={L.probTitle}>Mined for insights</h3>
      <p style={L.probBody}>Your spending habits become data points. Someone, somewhere, is learning what you buy.</p>
    </div>
    <div style={L.probCard}>
      <img src="/images/bar-couple.jpg" alt="" style={L.probImg} loading="lazy" />
      <h3 style={L.probTitle}>Shared with third parties</h3>
      <p style={L.probBody}>Ad networks, analytics, payment processors — your data gets passed around like a hot potato.</p>
    </div>
  </div>
</section>

      {/* QUOTE */}
      {/* Couple in nature — above the quote, no caption */}
<div style={L.quoteImgWrap}>
  <img src="/images/couple-nature.jpg" alt="" style={L.quoteImg} loading="lazy" />
</div>

<div style={L.quoteWrap}>
  <div style={L.quoteInner}>
    <div style={L.quoteLine} />
    <p style={L.quoteText}>"The best place to store sensitive data is somewhere no one else can reach it."</p>
    <span style={L.quoteAttr}>The only server Schplitz uses is your device.</span>
  </div>
</div>

      {/* HOW IT WORKS */}
      <section style={L.howSection}>
        <div style={L.sectionHead}>
          <span style={L.eyebrow}>how it works</span>
          <h2 style={L.sectionH2}>Simple.<br /><span style={L.accent}>By design.</span></h2>
        </div>
        <div style={L.stepsGrid}>
          {[
            { n: "01", title: "Set a shared secret",   body: "You and the other person agree on a security question and answer. That answer encrypts everything." },
            { n: "02", title: "Log your expenses",     body: "Add what you spent. Schplitz keeps it all on your device — nothing leaves without your say." },
            { n: "03", title: "Share a link",          body: "Generate an encrypted share link. The other person imports it, adds theirs, and sends one back." },
            { n: "04", title: "Settle up",             body: "Schplitz calculates who owes what across all currencies. No app account, no payment integration — just the number." },
          ].map((s, i) => (
            <div key={i} style={L.stepCard}>
              <span style={L.stepNum}>{s.n}</span>
              <h3 style={L.stepTitle}>{s.title}</h3>
              <p style={L.stepBody}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={L.ctaSection}>
        <div style={L.ctaGlow} />
        <div style={L.ctaInner}>
          <h2 style={L.ctaH2}>Your money.<br /><span style={L.accent}>Your business.</span></h2>
          <p style={L.ctaP}>No downloads. No installs. Just open and go.</p>
          <button onClick={onLaunch} style={L.heroCta}>
            Open Schplitz
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      </section>

      <footer style={L.footer}>
        <span style={L.footerLogo}>schplitz</span>
        <span style={L.footerCopy}>No data collected. No servers. Just the people splitting costs.</span>
      </footer>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────

export default function Schplitz() {
  const [view, setView] = useState("landing");
  if (view === "app") return <ExpenseTracker />;
  return <LandingPage onLaunch={() => setView("app")} />;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  setupOverlay:    { position: "fixed", inset: 0, background: "#0f0f13", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 },
  setupCard:       { background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 20, padding: "32px 28px", maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" },
  setupHeader:     { textAlign: "center", marginBottom: 32 },
  setupTitle:      { fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 8px", fontFamily: "Georgia,serif" },
  setupSub:        { fontSize: 14, color: "#7a7a8a", margin: 0 },
  choiceGrid:      { display: "grid", gap: 12 },
  choiceBtn:       { background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 12, padding: "20px 18px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, color: "#fff" },
  choiceBtnTitle:  { fontSize: 16, fontWeight: 600, color: "#fff" },
  choiceBtnDesc:   { fontSize: 13, color: "#7a7a8a", lineHeight: 1.4 },
  setupForm:       { display: "flex", flexDirection: "column", gap: 16 },
  backLink:        { background: "none", border: "none", color: "#e8d44d", fontSize: 13, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start", padding: 0 },
  setupField:      { display: "flex", flexDirection: "column", gap: 6 },
  setupLabel:      { fontSize: 12, color: "#8a8a9a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px" },
  setupInput:      { padding: "12px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#fff", fontSize: 15, outline: "none" },
  setupTextarea:   { padding: "12px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", minHeight: 120, resize: "vertical", fontFamily: "monospace" },
  setupDivider:    { height: 1, background: "#2e2e3e", margin: "8px 0" },
  setupSubmit:     { padding: "14px 20px", background: "#e8d44d", border: "none", borderRadius: 10, color: "#0f0f13", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  disabled:        { opacity: 0.35, cursor: "not-allowed" },
  inputError:      { borderColor: "#e05555" },
  inputOk:         { borderColor: "#4caf50" },
  inputHint:       { fontSize: 11, color: "#6a6a7a", marginTop: 2 },
  detectedQ:       { background: "#e8d44d15", border: "1px solid #e8d44d33", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#e8d44d", lineHeight: 1.5 },
  nameButtons:     { display: "flex", gap: 8, flexWrap: "wrap" },
  nameBtn:         { padding: "10px 18px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#8a8a9a", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  nameBtnActive:   { background: "#e8d44d22", border: "1px solid #e8d44d55", color: "#e8d44d" },
  root:            { minHeight: "100vh", background: "#0f0f13", color: "#fff", maxWidth: 560, margin: "0 auto", padding: "0 0 40px" },
  toast:           { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.4)" },
  overlay:         { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard:       { background: "#1a1a24", border: "1px solid #2e2e3e", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, maxHeight: "80vh", overflowY: "auto" },
  modalHdr:        { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle:      { fontSize: 17, fontWeight: 700, color: "#fff" },
  modalX:          { background: "none", border: "none", color: "#6a6a7a", cursor: "pointer", display: "flex", alignItems: "center", padding: 2 },
  modalDesc:       { fontSize: 13, color: "#7a7a8a", margin: "0 0 16px", lineHeight: 1.5 },
  statusGrid:      { display: "grid", gap: 8, marginBottom: 16 },
  statusBtn:       { padding: "12px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 },
  statusBtnActive: { background: "#e8d44d15", borderColor: "#e8d44d55" },
  statusLabel:     { fontSize: 14, color: "#ddd", fontWeight: 500 },
  expTA:           { width: "100%", minHeight: 140, maxHeight: 220, background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#8dd68d", fontSize: 12, padding: 12, fontFamily: "monospace", resize: "vertical", outline: "none", marginBottom: 14 },
  copyBtn:         { width: "100%", padding: 11, background: "#e8d44d", border: "none", borderRadius: 9, color: "#0f0f13", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 },
  header:          { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #1e1e2a" },
  hdrName:         { fontSize: 14, color: "#aaa", display: "flex", alignItems: "center", gap: 6 },
  hdrBtnExp:       { display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "transparent", border: "1px solid #e8d44d55", borderRadius: 7, color: "#e8d44d", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  sumWrap:         { padding: "16px 20px" },
  sumCard:         { background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 14, padding: 18 },
  sumTop:          { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sumTopR:         { display: "flex", alignItems: "center", gap: 10 },
  sumLabel:        { fontSize: 12, color: "#6a6a7a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" },
  settledBadge:    { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#4caf50", background: "#4caf5018", padding: "3px 8px", borderRadius: 20, fontWeight: 600 },
  rBadge:          { fontSize: 10, fontWeight: 600 },
  statusRow:       { display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  statusItem:      { flex: 1, minWidth: "45%", display: "flex", flexDirection: "column", gap: 4 },
  statusPerson:    { fontSize: 11, color: "#6a6a7a", fontWeight: 600 },
  statusBadge:     { fontSize: 11, color: "#e8d44d", background: "#e8d44d15", padding: "4px 8px", borderRadius: 6, display: "inline-block" },
  sumRow:          { display: "flex", alignItems: "stretch" },
  sumP:            { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  sumPN:           { fontSize: 13, color: "#aaa", fontWeight: 500 },
  sumPA:           { fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "Georgia,serif" },
  sumDiv:          { width: 1, background: "#2a2a3a", margin: "0 16px" },
  owesRow:         { marginTop: 12, paddingTop: 12, borderTop: "1px solid #222", fontSize: 13, color: "#8a8a9a", textAlign: "center" },
  owesN:           { color: "#e8d44d", fontWeight: 600 },
  owesA:           { color: "#fff", fontSize: 14 },
  addBtn:          { margin: "20px 20px 0", width: "calc(100% - 40px)", padding: 14, background: "#e8d44d", border: "none", borderRadius: 12, color: "#0f0f13", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
  formCard:        { margin: "16px 20px 0", background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 14, padding: 20 },
  fRow:            { marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  input:           { padding: "10px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" },
  select:          { padding: "10px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", flex: 1, minWidth: 140 },
  label:           { fontSize: 11, color: "#6a6a7a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", width: 52, flexShrink: 0 },
  fActs:           { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  cancelBtn:       { padding: "8px 18px", background: "transparent", border: "1px solid #2e2e3e", borderRadius: 8, color: "#8a8a9a", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  submitBtn:       { padding: "8px 22px", background: "#e8d44d", border: "none", borderRadius: 8, color: "#0f0f13", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 },
  listWrap:        { padding: "16px 20px 0" },
  expItem:         { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1e1e2a" },
  expL:            { display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 },
  expPB:           { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", display: "inline-block", width: "fit-content", padding: "2px 6px", borderRadius: 4 },
  pbMe:            { background: "#e8d44d18", color: "#e8d44d" },
  pbOt:            { background: "#3498db18", color: "#5ba9d6" },
  expDesc:         { fontSize: 14, color: "#ddd", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  expDate:         { fontSize: 11, color: "#5a5a6a" },
  expR:            { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  expAmt:          { fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "Georgia,serif" },
  expAmtG:         { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 },
  expAmtEur:       { fontSize: 11, color: "#6a6a7a", fontStyle: "italic" },
  delBtn:          { background: "none", border: "none", color: "#4a4a5a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, borderRadius: 4 },
  empty:           { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "60px 20px" },
  emptyT:          { fontSize: 14, color: "#5a5a6a", textAlign: "center", lineHeight: 1.5, maxWidth: 320 },
  footer:          { textAlign: "center", marginTop: 40 },
  resetBtn:        { background: "none", border: "none", color: "#4a4a5a", fontSize: 12, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 },
};

const L = {
  page:           { background: "#0a0a0e", color: "#fff", fontFamily: "Georgia,serif", minHeight: "100vh", overflowX: "hidden" },
  nav:            { position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 36px", background: "rgba(10,10,14,0.88)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  logo:           { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" },
  navCta:         { padding: "8px 22px", background: "transparent", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  hero:           { position: "relative", minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", overflow: "hidden" },
  glowA:          { position: "absolute", top: "-25%", left: "-8%", width: "55%", height: "75%", background: "radial-gradient(ellipse, rgba(232,212,77,0.09) 0%, transparent 70%)", pointerEvents: "none", zIndex: 1 },
  glowB:          { position: "absolute", bottom: "-15%", right: "48%", width: "30%", height: "55%", background: "radial-gradient(ellipse, rgba(59,130,246,0.055) 0%, transparent 70%)", pointerEvents: "none", zIndex: 1 },
  heroInner:      { position: "relative", zIndex: 2, padding: "120px 0 100px 60px" },
  heroImgWrap:    { position: "relative", height: "100vh", overflow: "hidden" },
  heroImg:        { width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" },
  heroImgOverlay: { position: "absolute", inset: 0, background: "linear-gradient(to right, #0a0a0e 0%, transparent 30%, rgba(0,0,0,0.3) 100%)" },
  eyebrow:        { display: "inline-block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "2.8px", color: "#e8d44d", marginBottom: 28, fontFamily: "system-ui,sans-serif" },
  heroH1:         { fontSize: "clamp(38px,4.5vw,66px)", fontWeight: 700, lineHeight: 1.06, color: "#fff", margin: "0 0 30px", letterSpacing: "-2px" },
  accent:         { color: "#e8d44d" },
  heroP:          { fontSize: 16, lineHeight: 1.7, color: "#7a7a8a", maxWidth: 460, margin: "0 0 38px", fontFamily: "system-ui,sans-serif", fontWeight: 400 },
  heroActs:       { display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" },
  heroCta:        { display: "inline-flex", alignItems: "center", gap: 10, background: "#e8d44d", border: "none", borderRadius: 10, color: "#0a0a0e", padding: "15px 30px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "system-ui,sans-serif", letterSpacing: "-0.2px", boxShadow: "0 2px 16px rgba(232,212,77,0.25)" },
  heroNote:       { fontSize: 12, color: "#4a4a5a", fontFamily: "system-ui,sans-serif", letterSpacing: "0.4px" },
  section:        { padding: "120px 60px", maxWidth: 1100, margin: "0 auto" },
  howSection:     { padding: "120px 60px", maxWidth: 1100, margin: "0 auto" },
  sectionHead:    { marginBottom: 60 },
  sectionH2:      { fontSize: "clamp(34px,5.5vw,52px)", fontWeight: 700, lineHeight: 1.12, color: "#fff", margin: "12px 0 0", letterSpacing: "-1.8px" },
  problemGrid:    { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18, marginBottom: 60 },
  probCard:       { background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "30px 26px" },
  probTitle:      { fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 10px", fontFamily: "system-ui,sans-serif" },
  probBody:       { fontSize: 13, lineHeight: 1.65, color: "#5f5f6f", margin: 0, fontFamily: "system-ui,sans-serif" },
  stepsGrid:      { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 60 },
  stepCard:       { padding: "28px 24px", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16 },
  stepNum:        { display: "block", fontSize: 11, fontWeight: 700, color: "#e8d44d", letterSpacing: "1px", fontFamily: "system-ui,sans-serif", marginBottom: 14 },
  stepTitle:      { fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 10px", fontFamily: "system-ui,sans-serif" },
  stepBody:       { fontSize: 13, lineHeight: 1.65, color: "#5f5f6f", margin: 0, fontFamily: "system-ui,sans-serif" },
  imageSection:   { padding: "0 60px 100px", maxWidth: 1100, margin: "0 auto" },
  imageWrap:      { display: "flex", flexDirection: "column", gap: 20, alignItems: "center" },
  image:          { width: "100%", maxWidth: 1000, height: 520, borderRadius: 16, objectFit: "cover", objectPosition: "center top", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" },
  imageCaption:   { fontSize: 15, color: "#6a6a7a", textAlign: "center", maxWidth: 600, margin: 0, fontFamily: "system-ui,sans-serif", lineHeight: 1.6, fontStyle: "italic" },
  quoteWrap:      { padding: "80px 60px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  quoteInner:     { maxWidth: 600, margin: "0 auto" },
  quoteLine:      { width: 40, height: 2, background: "#e8d44d", margin: "0 auto 28px", borderRadius: 1 },
  quoteText:      { fontSize: "clamp(20px,3.2vw,27px)", fontWeight: 400, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, margin: "0 0 14px", letterSpacing: "-0.3px" },
  quoteAttr:      { fontSize: 12, color: "#4a4a5a", fontFamily: "system-ui,sans-serif", letterSpacing: "0.4px" },
  ctaSection:     { position: "relative", padding: "160px 60px 140px", textAlign: "center", overflow: "hidden" },
  ctaGlow:        { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "70%", height: 280, background: "radial-gradient(ellipse, rgba(232,212,77,0.07) 0%, transparent 70%)", pointerEvents: "none" },
  ctaInner:       { position: "relative", zIndex: 1 },
  ctaH2:          { fontSize: "clamp(38px,6vw,58px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-2px", margin: "0 0 18px" },
  ctaP:           { fontSize: 16, color: "#5f5f6f", margin: "0 0 36px", fontFamily: "system-ui,sans-serif" },
  footer:         { padding: "44px 60px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" },
  footerLogo:     { display: "block", fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 8 },
  footerCopy:     { fontSize: 12, color: "#3a3a4a", fontFamily: "system-ui,sans-serif" },
  probImg:      { width: "100%", height: 200, objectFit: "cover", borderRadius: 10, marginBottom: 20, display: "block" },
quoteImgWrap: { maxWidth: 1100, margin: "0 auto", padding: "0 60px" },
quoteImg:     { width: "100%", height: 480, objectFit: "cover", objectPosition: "center 30%", borderRadius: 16, display: "block", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" },
};

