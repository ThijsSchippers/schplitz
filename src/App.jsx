import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════════
//  EXPENSE TRACKER APP
// ═══════════════════════════════════════════════════════════════════════════
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

async function fetchRates() {
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=EUR");
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.rates) return null;
    const o = { EUR:1 };
    for (const c of Object.keys(CURRENCIES)) if (c !== "EUR" && d.rates[c] != null) o[c] = d.rates[c];
    return o;
  } catch (err) {
    console.error("Failed to fetch exchange rates:", err);
    return null;
  }
}

function toEUR(amt, cur, rates) {
  if (cur === "EUR") return amt;
  return amt / (rates[cur] ?? FALLBACK_RATES[cur] ?? 1);
}

const I = {
  Plus:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Down:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Up:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Copy:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Chk:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  User:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="8" r="4"/></svg>,
  Settled:() => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
};

const fmt = (n, c) => {
  const s = (CURRENCIES[c] || CURRENCIES.EUR).symbol;
  const v = parseFloat(n);
  return isNaN(v) ? `${s}0.00` : `${s}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const uid = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 11);
  const extraRandom = Math.random().toString(36).slice(2, 6);
  return `${timestamp}-${randomPart}-${extraRandom}`;
};

const today = () => new Date().toISOString().split("T")[0];

function validateExpense(e) {
  if (!e || typeof e !== 'object') {
    throw new Error('Expense must be an object');
  }
  if (!e.id || typeof e.id !== 'string') {
    throw new Error('Invalid or missing expense ID');
  }
  if (!e.description || typeof e.description !== 'string' || !e.description.trim()) {
    throw new Error('Invalid or missing expense description');
  }
  if (typeof e.amount !== 'number' || isNaN(e.amount) || e.amount < 0) {
    throw new Error('Invalid expense amount');
  }
  if (!e.currency || !CURRENCIES[e.currency]) {
    throw new Error(`Unknown currency: ${e.currency}`);
  }
  if (!e.paidBy || typeof e.paidBy !== 'string' || !e.paidBy.trim()) {
    throw new Error('Invalid or missing paidBy field');
  }
  if (!e.date || typeof e.date !== 'string') {
    throw new Error('Invalid or missing date');
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(e.date)) {
    throw new Error('Invalid date format (expected YYYY-MM-DD)');
  }
  return true;
}

const PBKDF2_ITERS = 200_000;
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
  } catch (err) {
    console.error("Encryption failed:", err);
    throw err;
  }
}

async function decrypt(b64, pass) {
  try {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const key = await deriveKey(pass, raw.slice(0, 16));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(16, 28) }, key, raw.slice(28)));
  } catch (err) {
    console.error("Decryption failed:", err);
    throw err;
  }
}

function ExpenseTracker({ onBack }) {
  const [myName, setMyName]       = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [expenses, setExpenses]   = useState([]);
  const [form, setForm]           = useState({ description: "", amount: "", currency: "EUR", paidBy: "", date: today() });
  const [showForm, setShowForm]   = useState(false);
  const [toast, setToast]         = useState(null);
  const [modal, setModal]         = useState(null);
  const [impTab, setImpTab]       = useState("paste");
  const [impText, setImpText]     = useState("");
  const [copied, setCopied]       = useState(false);
  const [expPass, setExpPass]     = useState("");
  const [expResult, setExpResult] = useState("");
  const [exporting, setExporting] = useState(false);
  const [impPass, setImpPass]     = useState("");
  const [importing, setImporting] = useState(false);
  const [rates, setRates]         = useState(FALLBACK_RATES);
  const [rSrc, setRSrc]           = useState("fallback");
  const [loadingRates, setLoadingRates] = useState(true);
  const fileRef = useRef(null), taRef = useRef(null);

  useEffect(() => {
    if (!impText.trim()) { setExpPass(""); return; }
    try {
      const o = JSON.parse(impText);
      if (o.v === 2 && o.question) setExpPass(o.question);
      else setExpPass("");
    } catch (err) {
      console.error("Failed to parse import text:", err);
      setExpPass("");
    }
  }, [impText]);

  useEffect(() => {
    const stored = localStorage.getItem("schplitzExpenses");
    if (stored) {
      try {
        const p = JSON.parse(stored);
        setExpenses(p.expenses || []);
        if (p.myName) { setMyName(p.myName); setConfirmed(true); }
      } catch (err) {
        console.error("Failed to load expenses from storage:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (confirmed) {
      try {
        localStorage.setItem("schplitzExpenses", JSON.stringify({ myName, expenses }));
      } catch (err) {
        console.error("Failed to save expenses to storage:", err);
      }
    }
  }, [expenses, myName, confirmed]);

  useEffect(() => { 
    fetchRates().then(l => { 
      if (l) { 
        setRates(l); 
        setRSrc("live"); 
      }
    }).finally(() => {
      setLoadingRates(false);
    });
  }, []);

  const showToast = useCallback((msg, type = "success") => { 
    setToast({ msg, type }); 
    setTimeout(() => setToast(null), TOAST_DURATION); 
  }, []);

  const otherNames = useMemo(() => 
    [...new Set(expenses.map(e => e.paidBy).filter(n => n && n !== myName))],
    [expenses, myName]
  );

  const otherName = useMemo(() => 
    otherNames.length === 1 ? otherNames[0] : "",
    [otherNames]
  );

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
    if (!form.description.trim() || !form.amount || !form.paidBy) return;
    setExpenses(p => [{ id: uid(), description: form.description.trim(), amount: parseFloat(form.amount), currency: form.currency, paidBy: form.paidBy, date: form.date }, ...p]);
    setForm({ description: "", amount: "", currency: form.currency, paidBy: form.paidBy, date: today() });
    setShowForm(false);
    showToast("Expense added");
  };

  const handleExport = async () => {
    if (!expPass.trim() || !impPass.trim()) return;
    if (!expenses.length) { showToast("Nothing to export yet", "info"); return; }
    setExporting(true);
    try {
      const mini = expenses.map(e => ({ i: e.id, d: e.description, a: e.amount, c: e.currency, p: e.paidBy, t: e.date }));
      const blob = await encrypt(JSON.stringify(mini), impPass.trim());
      setExpResult(JSON.stringify({ question: expPass.trim(), encrypted: blob, v: 2 }, null, 2));
    } catch (err) {
      console.error("Export failed:", err);
      showToast("Encryption failed", "error");
    }
    setExporting(false);
  };

  const handleCopy = async () => {
    try { 
      await navigator.clipboard.writeText(expResult); 
    } catch (err) { 
      console.error("Clipboard write failed:", err);
      if (taRef.current) { 
        taRef.current.select(); 
        document.execCommand("copy"); 
      } 
    }
    setCopied(true); 
    setTimeout(() => setCopied(false), 1800); 
    showToast("Copied to clipboard");
  };

  const processImport = async () => {
    if (!impText.trim() || !impPass.trim()) return;
    setImporting(true);
    try {
      const o = JSON.parse(impText);
      if (!o.encrypted) throw new Error("Missing encrypted data");
      
      if (o.v === 2) {
        if (!o.question) throw new Error("Missing security question");
        const inner = JSON.parse(await decrypt(o.encrypted, impPass.trim()));
        if (!Array.isArray(inner)) throw new Error("Invalid data format");
        
        const expanded = inner.map(e => ({
          id: e.i,
          description: e.d,
          amount: e.a,
          currency: e.c,
          paidBy: e.p,
          date: e.t
        }));
        
        expanded.forEach((e, idx) => {
          try {
            validateExpense(e);
          } catch (err) {
            throw new Error(`Invalid expense at index ${idx}: ${err.message}`);
          }
        });
        
        const ids   = new Set(expenses.map(e => e.id));
        const fresh = expanded.filter(e => e.id && !ids.has(e.id));
        if (!fresh.length) { 
          showToast("No new expenses found", "info"); 
          setImporting(false); 
          return; 
        }
        setExpenses(p => [...p, ...fresh]);
        showToast(`Imported ${fresh.length} expense${fresh.length > 1 ? "s" : ""}`);
        setModal(null); setImpText(""); setImpPass(""); setExpPass("");
      }
      else if (o.v === 1) {
        const inner = JSON.parse(await decrypt(o.encrypted, impPass.trim()));
        if (!Array.isArray(inner.expenses)) throw new Error("Invalid v1 data format");
        
        inner.expenses.forEach((e, idx) => {
          try {
            validateExpense(e);
          } catch (err) {
            throw new Error(`Invalid expense at index ${idx}: ${err.message}`);
          }
        });
        
        const ids   = new Set(expenses.map(e => e.id));
        const fresh = inner.expenses.filter(e => e.id && !ids.has(e.id));
        if (!fresh.length) { 
          showToast("No new expenses found", "info"); 
          setImporting(false); 
          return; 
        }
        setExpenses(p => [...p, ...fresh]);
        showToast(`Imported ${fresh.length} expense${fresh.length > 1 ? "s" : ""}`);
        setModal(null); setImpText(""); setImpPass(""); setExpPass("");
      }
      else throw new Error("Unsupported data version");
    } catch (err) {
      console.error("Import failed:", err);
      showToast(
        err.name === "OperationError" 
          ? "Wrong answer or corrupted data" 
          : `Import failed: ${err.message}`, 
        "error"
      );
    }
    setImporting(false);
  };

  const handleFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { setImpText(ev.target.result); setImpTab("paste"); };
    r.onerror = () => {
      console.error("Failed to read file");
      showToast("Failed to read file", "error");
    };
    r.readAsText(f); e.target.value = "";
  };

  if (!confirmed) return (
    <div style={S.nameScreen}>
      <button onClick={onBack} style={S.backBtn}>← Back</button>
      <div style={S.nameCard}>
        <div style={S.nameIconWrap}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e8d44d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <h1 style={S.nameTitle}>Schplitz</h1>
        <p style={S.nameSub}>Track shared costs and settle up easily.</p>
        <input autoFocus value={myName} onChange={e => setMyName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && myName.trim() && (setMyName(myName.trim()), setConfirmed(true))}
          placeholder="Your name" style={S.nameInput} />
        <button onClick={() => { if (myName.trim()) { setMyName(myName.trim()); setConfirmed(true); } }} style={S.nameBtn}>Get Started</button>
      </div>
    </div>
  );

  const disabledStyle = { opacity: 0.35, cursor: "not-allowed" };
  return (
    <div style={S.root}>
      {toast && <div style={{ ...S.toast, background: toast.type === "error" ? "#c0392b" : toast.type === "info" ? "#2980b9" : "#27ae60" }}>{toast.msg}</div>}

      {modal && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <span style={S.modalTitle}>{modal === "export" ? "Export Expenses" : "Import Expenses"}</span>
              <button onClick={() => setModal(null)} style={S.modalX}><I.X /></button>
            </div>
            {modal === "export" && (<>
              <p style={S.modalDesc}>Create a security question only the other person can answer.</p>
              <input autoFocus placeholder="Security question (e.g., Where did we meet?)" value={expPass}
                onChange={e => { setExpPass(e.target.value); setExpResult(""); }}
                style={{ ...S.input, width: "100%", marginBottom: 12 }} />
              <input type="password" placeholder="Answer (used to encrypt)" value={impPass}
                onChange={e => { setImpPass(e.target.value); setExpResult(""); }}
                onKeyDown={e => e.key === "Enter" && handleExport()}
                style={{ ...S.input, width: "100%", marginBottom: 12 }} />
              {!expResult ? (
                <button onClick={handleExport} disabled={!expPass.trim() || !impPass.trim() || exporting}
                  style={{ ...S.copyBtn, ...(!expPass.trim() || !impPass.trim() || exporting ? disabledStyle : {}) }}>
                  {exporting ? "Encrypting…" : "Encrypt & Export"}
                </button>
              ) : (<>
                <p style={{ ...S.modalDesc, marginBottom: 8 }}>Encrypted — safe to copy and send.</p>
                <textarea ref={taRef} readOnly value={expResult} style={S.expTA} />
                <button onClick={handleCopy} style={S.copyBtn}>
                  {copied ? <><I.Chk /> Copied!</> : <><I.Copy /> Copy to Clipboard</>}
                </button>
              </>)}
            </>)}
            {modal === "import" && (<>
              <div style={S.tabRow}>
                <button onClick={() => setImpTab("paste")} style={{ ...S.tab, ...(impTab === "paste" ? S.tabAct : {}) }}>Paste Data</button>
                <button onClick={() => setImpTab("file")}  style={{ ...S.tab, ...(impTab === "file"  ? S.tabAct : {}) }}>Upload File</button>
              </div>
              {impTab === "paste" ? (
                <p style={S.modalDesc}>Paste the encrypted data from the other person.</p>
              ) : (<>
                <p style={S.modalDesc}>Select a previously exported <code style={{ color: "#e8d44d", background: "#e8d44d15", padding: "2px 6px", borderRadius: 4 }}>.json</code> file.</p>
                <input ref={fileRef} type="file" accept=".json" onChange={handleFile} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} style={{ ...S.copyBtn, marginBottom: 12 }}><I.Up /> Choose File</button>
              </>)}
              {(impTab === "paste" || impText) && (<>
                <textarea value={impText} onChange={e => { setImpText(e.target.value); setExpPass(""); }} placeholder="Paste encrypted data here…" style={S.impTA} />
                {expPass && <div style={S.secQ}><strong>Security Question:</strong> {expPass}</div>}
                <input type="password" placeholder="Answer" value={impPass}
                  onChange={e => setImpPass(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && processImport()}
                  style={{ ...S.input, width: "100%", marginBottom: 12 }} />
                <button onClick={processImport} disabled={!impText.trim() || !impPass.trim() || importing}
                  style={{ ...S.copyBtn, ...(!impText.trim() || !impPass.trim() || importing ? disabledStyle : {}) }}>
                  <I.Up /> {importing ? "Decrypting…" : "Decrypt & Import"}
                </button>
              </>)}
            </>)}
          </div>
        </div>
      )}

      <header style={S.header}>
        <span style={S.hdrName}><I.User /> {myName}</span>
        <div style={S.hdrActs}>
          <button onClick={() => { setImpTab("paste"); setImpText(""); setImpPass(""); setExpPass(""); setModal("import"); }} style={S.hdrBtn}><I.Up /> Import</button>
          <button onClick={() => { setExpPass(""); setImpPass(""); setExpResult(""); setModal("export"); }} style={{ ...S.hdrBtn, ...S.hdrBtnExp }}><I.Down /> Export</button>
        </div>
      </header>

      {summary && (
        <div style={S.sumWrap}>
          <div style={S.sumCard}>
            <div style={S.sumTop}>
              <span style={S.sumLabel}>Balance (EUR)</span>
              <div style={S.sumTopR}>
                {loadingRates ? (
                  <span style={{ ...S.rBadge, color: "#888" }}>● loading rates...</span>
                ) : (
                  <span style={{ ...S.rBadge, color: rSrc === "live" ? "#4caf50" : "#e8a84d" }}>
                    {rSrc === "live" ? "● live rates" : "● fallback rates"}
                  </span>
                )}
                {summary.myBalance === 0 && <span style={S.settledBadge}><I.Settled /> Settled</span>}
              </div>
            </div>
            <div style={S.sumRow}>
              <div style={S.sumP}><span style={S.sumPN}>{myName}</span><span style={S.sumPA}>{fmt(summary.myTotal, "EUR")}</span></div>
              <div style={S.sumDiv} />
              <div style={S.sumP}><span style={S.sumPN}>{otherName}</span><span style={S.sumPA}>{fmt(summary.otherTotal, "EUR")}</span></div>
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
          <div style={S.fRow}><input autoFocus placeholder="What was it for?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...S.input, flex: 1 }} /></div>
          <div style={S.fRow}>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={{ ...S.input, width: 110 }} />
            <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} style={S.select}>
              {Object.entries(CURRENCIES).map(([c, { symbol, name }]) => <option key={c} value={c}>{symbol} {c} — {name}</option>)}
            </select>
          </div>
          <div style={S.fRow}>
            <label style={S.label}>Paid by</label>
            <div style={S.pbRow}>
              <button onClick={() => setForm(p => ({ ...p, paidBy: myName }))} style={{ ...S.pbBtn, ...(form.paidBy === myName ? S.pbAct : {}) }}>{myName}</button>
              {otherName && <button onClick={() => setForm(p => ({ ...p, paidBy: otherName }))} style={{ ...S.pbBtn, ...(form.paidBy === otherName ? S.pbAct : {}) }}>{otherName}</button>}
              {!otherName && form.paidBy !== myName && <input placeholder="Other person's name" value={form.paidBy} onChange={e => setForm(p => ({ ...p, paidBy: e.target.value }))} style={{ ...S.input, flex: 1, fontSize: 13 }} />}
            </div>
          </div>
          <div style={S.fRow}>
            <label style={S.label}>Date</label>
            <input 
              type="date" 
              value={form.date} 
              max={today()}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))} 
              style={{ ...S.input, width: 160 }} 
            />
          </div>
          <div style={S.fActs}>
            <button onClick={() => setShowForm(false)} style={S.cancelBtn}>Cancel</button>
            <button onClick={addExpense} disabled={!form.description.trim() || !form.amount || !form.paidBy}
              style={{ ...S.submitBtn, ...(!form.description.trim() || !form.amount || !form.paidBy ? disabledStyle : {}) }}>
              <I.Plus /> Add
            </button>
          </div>
        </div>
      )}

      <div style={S.listWrap}>
        {expenses.length === 0 ? (
          <div style={S.empty}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#3a3a4a" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            <p style={S.emptyT}>No expenses yet. Add one above, or import from the other person.</p>
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
                {e.currency !== "EUR" && <span style={S.expAmtEur}>≈ {fmt(toEUR(e.amount, e.currency, rates), "EUR")}</span>}
              </div>
              <button onClick={() => setExpenses(p => p.filter(x => x.id !== e.id))} style={S.delBtn} title="Delete"><I.Trash /></button>
            </div>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        <button onClick={() => { 
          setExpenses([]); 
          setMyName(""); 
          setConfirmed(false); 
          try { 
            localStorage.removeItem("schplitzExpenses"); 
          } catch (err) {
            console.error("Failed to delete storage:", err);
          }
        }} style={S.resetBtn}>Reset everything</button>
      </div>
    </div>
  );
}

function LandingPage({ onLaunch }) {
  return (
    <div style={L.page}>
      <nav style={L.nav}>
        <span style={L.logo}>schplitz</span>
        <button onClick={onLaunch} style={L.navCta}>Open App</button>
      </nav>

      <section style={L.hero}>
        <div style={L.glowA} />
        <div style={L.glowB} />
        <div style={L.heroInner}>
          <span style={L.eyebrow}>expense splitting, redesigned</span>
          <h1 style={L.heroH1}>
            Don't let your<br />
            purchase history<br />
            haunt <span style={L.accent}>your future.</span>
          </h1>
          <p style={L.heroP}>
            Schplitz keeps expenses on your device. Share them encrypted with one other person. No cloud, no tracking.
          </p>
          <div style={L.heroActs}>
            <button onClick={onLaunch} style={L.heroCta}>
              Start splitting
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <span style={L.heroNote}>No account · No sign-up · No cloud</span>
          </div>
        </div>
      </section>

      <section style={L.section}>
        <div style={L.sectionHead}>
          <span style={L.eyebrow}>the uncomfortable truth</span>
          <h2 style={L.sectionH2}>Most apps<br /><span style={L.accent}>know too much.</span></h2>
        </div>
        <div style={L.problemGrid}>
          {[
            { icon: "☁️", title: "Synced to the cloud", body: "Every expense you log is uploaded to a server you don't own, run by a company you've never met." },
            { icon: "📊", title: "Mined for insights", body: "Your spending habits become data points. Someone, somewhere, is learning what you buy." },
            { icon: "👥", title: "Shared with third parties", body: "Ad networks, analytics, payment processors — your data gets passed around like a hot potato." },
          ].map((item, i) => (
            <div key={i} style={L.probCard}>
              <span style={L.probIcon}>{item.icon}</span>
              <h3 style={L.probTitle}>{item.title}</h3>
              <p style={L.probBody}>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={L.quoteWrap}>
        <div style={L.quoteInner}>
          <div style={L.quoteLine} />
          <p style={L.quoteText}>"The best place to store sensitive data is somewhere no one else can reach it."</p>
          <span style={L.quoteAttr}>— the only server Schplitz uses is your device</span>
        </div>
      </div>

      <section style={L.ctaSection}>
        <div style={L.ctaGlow} />
        <div style={L.ctaInner}>
          <h2 style={L.ctaH2}>Your money.<br /><span style={L.accent}>Your business.</span></h2>
          <p style={L.ctaP}>No downloads. No installs. Just open and go.</p>
          <button onClick={onLaunch} style={L.heroCta}>
            Open Schplitz
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </section>

      <footer style={L.footer}>
        <span style={L.footerLogo}>schplitz</span>
        <span style={L.footerCopy}>© 2026 · No data collected · No servers · Just the people splitting costs</span>
      </footer>
    </div>
  );
}

const S = {
  backBtn: { position: "fixed", top: 18, left: 20, background: "none", border: "none", color: "#e8d44d", fontSize: 13, fontWeight: 600, cursor: "pointer", zIndex: 10 },
  nameScreen: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f0f13", padding: 24 },
  nameCard: { background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 20, padding: "48px 40px", maxWidth: 420, width: "100%", textAlign: "center" },
  nameIconWrap: { marginBottom: 24 },
  nameTitle: { fontSize: 28, fontWeight: 700, color: "#fff", margin: "0 0 8px", fontFamily: "Georgia,serif", letterSpacing: "-0.5px" },
  nameSub: { fontSize: 14, color: "#7a7a8a", margin: "0 0 28px", lineHeight: 1.5 },
  nameInput: { width: "100%", padding: "14px 18px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 10, color: "#fff", fontSize: 16, outline: "none", marginBottom: 14 },
  nameBtn: { width: "100%", padding: 14, background: "#e8d44d", border: "none", borderRadius: 10, color: "#0f0f13", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  root: { minHeight: "100vh", background: "#0f0f13", color: "#fff", maxWidth: 560, margin: "0 auto", padding: "0 0 40px" },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.4)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { background: "#1a1a24", border: "1px solid #2e2e3e", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, maxHeight: "80vh", overflowY: "auto" },
  modalHdr: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 700, color: "#fff" },
  modalX: { background: "none", border: "none", color: "#6a6a7a", cursor: "pointer", display: "flex", alignItems: "center", padding: 2 },
  modalDesc: { fontSize: 13, color: "#7a7a8a", margin: "0 0 16px", lineHeight: 1.5 },
  expTA: { width: "100%", minHeight: 140, maxHeight: 220, background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#8dd68d", fontSize: 12, padding: 12, fontFamily: "monospace", resize: "vertical", outline: "none", marginBottom: 14 },
  impTA: { width: "100%", minHeight: 140, background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#ddd", fontSize: 13, padding: 12, fontFamily: "monospace", resize: "vertical", outline: "none", marginBottom: 14 },
  secQ: { background: "#e8d44d15", border: "1px solid #e8d44d33", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#e8d44d", lineHeight: 1.5 },
  copyBtn: { width: "100%", padding: 11, background: "#e8d44d", border: "none", borderRadius: 9, color: "#0f0f13", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 },
  tabRow: { display: "flex", gap: 6, marginBottom: 18, background: "#12121a", borderRadius: 8, padding: 4 },
  tab: { flex: 1, padding: "7px 0", background: "transparent", border: "none", borderRadius: 6, color: "#6a6a7a", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tabAct: { background: "#1a1a24", color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #1e1e2a" },
  hdrName: { fontSize: 14, color: "#aaa", display: "flex", alignItems: "center", gap: 6 },
  hdrActs: { display: "flex", gap: 8 },
  hdrBtn: { display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", background: "transparent", border: "1px solid #2e2e3e", borderRadius: 7, color: "#aaa", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  hdrBtnExp: { borderColor: "#e8d44d55", color: "#e8d44d" },
  sumWrap: { padding: "16px 20px" },
  sumCard: { background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 14, padding: 18 },
  sumTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sumTopR: { display: "flex", alignItems: "center", gap: 10 },
  sumLabel: { fontSize: 12, color: "#6a6a7a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" },
  settledBadge: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#4caf50", background: "#4caf5018", padding: "3px 8px", borderRadius: 20, fontWeight: 600 },
  rBadge: { fontSize: 10, fontWeight: 600 },
  sumRow: { display: "flex", alignItems: "stretch" },
  sumP: { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  sumPN: { fontSize: 13, color: "#aaa", fontWeight: 500 },
  sumPA: { fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "Georgia,serif" },
  sumDiv: { width: 1, background: "#2a2a3a", margin: "0 16px" },
  owesRow: { marginTop: 12, paddingTop: 12, borderTop: "1px solid #222", fontSize: 13, color: "#8a8a9a", textAlign: "center" },
  owesN: { color: "#e8d44d", fontWeight: 600 },
  owesA: { color: "#fff", fontSize: 14 },
  addBtn: { margin: "20px 20px 0", width: "calc(100% - 40px)", padding: 14, background: "#e8d44d", border: "none", borderRadius: 12, color: "#0f0f13", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
  formCard: { margin: "16px 20px 0", background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 14, padding: 20 },
  fRow: { marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  input: { padding: "10px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" },
  select: { padding: "10px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", flex: 1, minWidth: 140 },
  label: { fontSize: 11, color: "#6a6a7a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", width: 52, flexShrink: 0 },
  pbRow: { display: "flex", gap: 8, flex: 1, flexWrap: "wrap" },
  pbBtn: { padding: "8px 16px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#8a8a9a", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  pbAct: { background: "#e8d44d22", border: "1px solid #e8d44d55", color: "#e8d44d" },
  fActs: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  cancelBtn: { padding: "8px 18px", background: "transparent", border: "1px solid #2e2e3e", borderRadius: 8, color: "#8a8a9a", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  submitBtn: { padding: "8px 22px", background: "#e8d44d", border: "none", borderRadius: 8, color: "#0f0f13", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 },
  listWrap: { padding: "16px 20px 0" },
  expItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1e1e2a" },
  expL: { display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 },
  expPB: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", display: "inline-block", width: "fit-content", padding: "2px 6px", borderRadius: 4 },
  pbMe: { background: "#e8d44d18", color: "#e8d44d" },
  pbOt: { background: "#3498db18", color: "#5ba9d6" },
  expDesc: { fontSize: 14, color: "#ddd", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  expDate: { fontSize: 11, color: "#5a5a6a" },
  expR: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  expAmt: { fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "Georgia,serif" },
  expAmtG: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 },
  expAmtEur: { fontSize: 11, color: "#6a6a7a", fontStyle: "italic" },
  delBtn: { background: "none", border: "none", color: "#4a4a5a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, borderRadius: 4, transition: "color .15s" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "60px 20px" },
  emptyT: { fontSize: 14, color: "#5a5a6a", textAlign: "center", lineHeight: 1.5, maxWidth: 320 },
  footer: { textAlign: "center", marginTop: 40 },
  resetBtn: { background: "none", border: "none", color: "#4a4a5a", fontSize: 12, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 },
};

const L = {
  page: { background: "#0a0a0e", color: "#fff", fontFamily: "Georgia,serif", minHeight: "100vh", overflowX: "hidden" },
  nav: { position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 36px", background: "rgba(10,10,14,0.88)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  logo: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" },
  navCta: { padding: "8px 22px", background: "transparent", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "border-color .2s, background .2s" },
  hero: { position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "140px 40px 100px", overflow: "hidden" },
  glowA: { position: "absolute", top: "-25%", left: "-8%", width: "55%", height: "75%", background: "radial-gradient(ellipse, rgba(232,212,77,0.09) 0%, transparent 70%)", pointerEvents: "none" },
  glowB: { position: "absolute", bottom: "-15%", right: "-6%", width: "45%", height: "55%", background: "radial-gradient(ellipse, rgba(59,130,246,0.055) 0%, transparent 70%)", pointerEvents: "none" },
  heroInner: { position: "relative", zIndex: 1, maxWidth: 700 },
  eyebrow: { display: "inline-block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "2.8px", color: "#e8d44d", marginBottom: 28, fontFamily: "system-ui,sans-serif" },
  heroH1: { fontSize: "clamp(44px,7.5vw,76px)", fontWeight: 700, lineHeight: 1.06, color: "#fff", margin: "0 0 30px", letterSpacing: "-2.5px" },
  accent: { color: "#e8d44d" },
  heroP: { fontSize: 17, lineHeight: 1.7, color: "#7a7a8a", maxWidth: 540, margin: "0 0 38px", fontFamily: "system-ui,sans-serif", fontWeight: 400 },
  heroActs: { display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" },
  heroCta: { display: "inline-flex", alignItems: "center", gap: 10, background: "#e8d44d", border: "none", borderRadius: 10, color: "#0a0a0e", padding: "15px 30px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "system-ui,sans-serif", letterSpacing: "-0.2px", transition: "background .18s, transform .12s", boxShadow: "0 2px 16px rgba(232,212,77,0.25)" },
  heroNote: { fontSize: 12, color: "#4a4a5a", fontFamily: "system-ui,sans-serif", letterSpacing: "0.4px" },
  section: { padding: "120px 40px", maxWidth: 980, margin: "0 auto" },
  sectionHead: { marginBottom: 60, textAlign: "center" },
  sectionH2: { fontSize: "clamp(34px,5.5vw,52px)", fontWeight: 700, lineHeight: 1.12, color: "#fff", margin: 0, letterSpacing: "-1.8px" },
  problemGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18 },
  probCard: { background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "30px 26px" },
  probIcon: { fontSize: 30, display: "block", marginBottom: 18 },
  probTitle: { fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 10px", fontFamily: "system-ui,sans-serif" },
  probBody: { fontSize: 13, lineHeight: 1.65, color: "#5f5f6f", margin: 0, fontFamily: "system-ui,sans-serif" },
  quoteWrap: { padding: "60px 40px", textAlign: "center" },
  quoteInner: { maxWidth: 600, margin: "0 auto" },
  quoteLine: { width: 40, height: 2, background: "#e8d44d", margin: "0 auto 28px", borderRadius: 1 },
  quoteText: { fontSize: "clamp(20px,3.2vw,27px)", fontWeight: 400, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, margin: "0 0 14px", letterSpacing: "-0.3px" },
  quoteAttr: { fontSize: 12, color: "#4a4a5a", fontFamily: "system-ui,sans-serif", letterSpacing: "0.4px" },
  ctaSection: { position: "relative", padding: "140px 40px 120px", textAlign: "center", overflow: "hidden" },
  ctaGlow: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "70%", height: 280, background: "radial-gradient(ellipse, rgba(232,212,77,0.07) 0%, transparent 70%)", pointerEvents: "none" },
  ctaInner: { position: "relative", zIndex: 1 },
  ctaH2: { fontSize: "clamp(38px,6vw,58px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-2px", margin: "0 0 18px" },
  ctaP: { fontSize: 16, color: "#5f5f6f", margin: "0 0 36px", fontFamily: "system-ui,sans-serif" },
  footer: { padding: "44px 40px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" },
  footerLogo: { display: "block", fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 8 },
  footerCopy: { fontSize: 12, color: "#3a3a4a", fontFamily: "system-ui,sans-serif" },
};

export default function Schplitz() {
  const [view, setView] = useState("landing");
  if (view === "app") return <ExpenseTracker onBack={() => setView("landing")} />;
  return <LandingPage onLaunch={() => setView("app")} />;
    }
