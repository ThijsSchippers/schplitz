import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import LandingPage from "./LandingPage.jsx";
import {
  CURRENCIES, STATUS_OPTIONS, TOAST_DURATION,
  MAX_NAME_LEN, MAX_QUESTION_LEN, MAX_SETTLEMENT_LEN,
  normalizeAnswer, compressToUrl, decompressFromUrl,
  encrypt, decrypt, encryptCompressed, decryptCompressed, validateExpense,
  fmt, uid, today, toEURHistorical,
  PLACEHOLDER_ME, PLACEHOLDER_OTHER,
  SETTLEMENT_PLACEHOLDERS_DEBTOR, SETTLEMENT_PLACEHOLDERS_CREDITOR,
} from "./utils.js";

const I = {
  Plus:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Up:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Copy:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Chk:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  User:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="8" r="4"/></svg>,
  Settled: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Link:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
};


// ─── EXPENSE TRACKER ─────────────────────────────────────────────────────────

function ExpenseTracker({ onResetToSetup } = {}) {
  const [initialized, setInitialized]               = useState(false);
  const [myName, setMyName]                         = useState("");
  const [otherName, setOtherName]                   = useState("");
  const [securityQuestion, setSecurityQuestion]     = useState("");
  const [securityAnswer, setSecurityAnswer]         = useState("");
  const [statuses, setStatuses]                     = useState({});
  const [settlements, setSettlements]               = useState({});
  const [expenses, setExpenses]                     = useState([]);
  const [form, setForm]                             = useState({ description: "", amount: "", currency: "EUR", date: today() });
  const [showForm, setShowForm]                     = useState(false);
  const [toast, setToast]                           = useState(null);
  const [modal, setModal]                           = useState(null);

  const [setupMode, setSetupMode]                   = useState("new");
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
  const [newTallyStep, setNewTallyStep]              = useState(1);
  const [pendingNewTally, setPendingNewTally]         = useState(false);
  const [exportIsUrl, setExportIsUrl]               = useState(false);
  const [copied, setCopied]                         = useState(false);

  const [eurAmounts, setEurAmounts]                  = useState({});
  const [promptAnswer, setPromptAnswer]               = useState("");
  const [settlementDraft, setSettlementDraft]         = useState("");

  const taRef = useRef(null);

  const answersMatch   = setupAnswer && setupAnswerConfirm && setupAnswer === setupAnswerConfirm;
  const answerMismatch = setupAnswer && setupAnswerConfirm && setupAnswer !== setupAnswerConfirm;

  useEffect(() => {
    const hash = window.location.hash;

    // A share link always takes priority — always show the import screen so the
    // user can see all entries (including the other party's) after decrypting.
    // We never silently load from localStorage here, because the link may belong
    // to an entirely different tally with different people.
    if (hash.startsWith("#share=")) {
      const compressed = hash.slice(7);
      (async () => {
        try {
          const json = await decompressFromUrl(compressed);
          const data = JSON.parse(json);
          if (data.v === 3 || data.v === 4) {
            setImportText(json);
            setDetectedQuestion(data.question || "");
            setDetectedNames(data.names || []);
            setSetupMode("import");
          }
        } catch { console.error("Failed to parse share URL"); }
      })();
      return; // Do not load localStorage — let the user import from the link
    }

    const stored = localStorage.getItem("schplitzExpenses");
    if (stored) {
      try {
        const p = JSON.parse(stored);
        if (p.initialized) {
          setMyName(p.myName || ""); setOtherName(p.otherName || "");
          setSecurityQuestion(p.securityQuestion || "");
          setSecurityAnswer(sessionStorage.getItem("schplitzAnswer") || "");
          setStatuses(p.statuses || {});
          setSettlements(p.settlements || {});
          setExpenses(p.expenses || []); setInitialized(true);
        }
      } catch { console.error("Failed to load from storage"); }
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;
    try {
      localStorage.setItem("schplitzExpenses", JSON.stringify({
        initialized: true, myName, otherName, securityQuestion,
        statuses, settlements, expenses
      }));
      if (securityAnswer) sessionStorage.setItem("schplitzAnswer", securityAnswer);
    } catch { console.error("Failed to save"); }
  }, [initialized, myName, otherName, securityQuestion, securityAnswer, statuses, settlements, expenses]);

  useEffect(() => {
    if (!importText.trim()) { setDetectedQuestion(""); setDetectedNames([]); return; }
    try {
      const o = JSON.parse(importText);
      if (o.v === 3 || o.v === 4) { setDetectedQuestion(o.question || ""); setDetectedNames(o.names || []); }
      else { setDetectedQuestion(""); setDetectedNames([]); }
    } catch { setDetectedQuestion(""); setDetectedNames([]); }
  }, [importText]);

  useEffect(() => {
    if (!expenses.length) { setEurAmounts({}); return; }
    let cancelled = false;
    (async () => {
      const results = {};
      await Promise.all(expenses.map(async e => {
        results[e.id] = await toEURHistorical(e.amount, e.currency, e.date);
      }));
      if (!cancelled) setEurAmounts(results);
    })();
    return () => { cancelled = true; };
  }, [expenses]);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), TOAST_DURATION);
  }, []);

  const [settlePlaceholderDebtor]   = useState(() => SETTLEMENT_PLACEHOLDERS_DEBTOR[Math.floor(Math.random() * SETTLEMENT_PLACEHOLDERS_DEBTOR.length)]);
  const [settlePlaceholderCreditor] = useState(() => SETTLEMENT_PLACEHOLDERS_CREDITOR[Math.floor(Math.random() * SETTLEMENT_PLACEHOLDERS_CREDITOR.length)]);

  const summary = useMemo(() => {
    if (!otherName) return null;
    let my = 0, ot = 0;
    expenses.forEach(e => {
      const eur = eurAmounts[e.id] ?? 0;
      if (e.paidBy === myName) my += eur;
      else if (e.paidBy === otherName) ot += eur;
    });
    return { myTotal: my, otherTotal: ot, myBalance: my - (my + ot) / 2 };
  }, [expenses, eurAmounts, myName, otherName]);

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
    if (setupMyName.trim().length > MAX_NAME_LEN || setupOtherName.trim().length > MAX_NAME_LEN) {
      showToast(`Names must be ${MAX_NAME_LEN} characters or fewer`, "error"); return;
    }
    if (setupQuestion.trim().length > MAX_QUESTION_LEN) {
      showToast(`Security question must be ${MAX_QUESTION_LEN} characters or fewer`, "error"); return;
    }
    setMyName(setupMyName.trim()); setOtherName(setupOtherName.trim());
    setSecurityQuestion(setupQuestion.trim()); setSecurityAnswer(setupAnswer);
    sessionStorage.setItem("schplitzAnswer", setupAnswer);
    setStatuses({}); setSettlements({}); setExpenses([]);
    setInitialized(true); showToast("New tally started!");
  };

  const handleSetupImport = async () => {
    if (!importText.trim() || !importAnswer.trim() || !setupMyName.trim()) {
      showToast("Please fill in all fields", "error"); return;
    }
    if (setupMyName.trim().length > MAX_NAME_LEN) {
      showToast(`Name must be ${MAX_NAME_LEN} characters or fewer`, "error"); return;
    }
    setImporting(true);
    try {
      const o = JSON.parse(importText);
      if (!o.encrypted || (o.v !== 3 && o.v !== 4)) throw new Error("Invalid import format");
      if (typeof o.question === "string" && o.question.length > MAX_QUESTION_LEN) throw new Error("Security question in share data is too long");
      if (Array.isArray(o.names) && o.names.some(n => typeof n === "string" && n.length > MAX_NAME_LEN)) throw new Error("A name in share data exceeds the maximum length");
      const normalizedAnswer = normalizeAnswer(importAnswer);
      // v3: plain-JSON-then-encrypt (legacy). v4: deflate-then-encrypt (current).
      const decrypted = o.v === 4
        ? await decryptCompressed(o.encrypted, normalizedAnswer)
        : await decrypt(o.encrypted, normalizedAnswer);
      const data = JSON.parse(decrypted);
      if (!Array.isArray(data.expenses)) throw new Error("Invalid data format");
      if (data.settlement != null && (typeof data.settlement !== "string" || data.settlement.length > MAX_SETTLEMENT_LEN)) {
        throw new Error("Invalid settlement message in share data");
      }
      const expenses = data.expenses.map((e, idx) => {
        const full = {
          id:          e.id ?? e.i,
          description: e.description ?? e.d,
          amount:      e.amount ?? e.a,
          currency:    e.currency ?? e.c,
          paidBy:      e.paidBy ?? e.p,
          date:        e.date ?? e.t,
        };
        try { validateExpense(full); }
        catch (err) { throw new Error(`Invalid expense at index ${idx}: ${err.message}`); }
        return full;
      });
      const otherPersonName = (o.names || []).find(n => n !== setupMyName.trim()) || "";
      let mergedStatuses = {};
      let mergedSettlements = {};
      try {
        const stored = localStorage.getItem("schplitzExpenses");
        if (stored) {
          const p = JSON.parse(stored);
          if (p.initialized && p.securityQuestion === (o.question || "")) {
            mergedStatuses = { ...p.statuses };
            mergedSettlements = { ...p.settlements };
          }
        }
      } catch {}
      if (data.status && otherPersonName) mergedStatuses[otherPersonName] = data.status;
      if (data.settlement && otherPersonName) mergedSettlements[otherPersonName] = data.settlement;
      setMyName(setupMyName.trim()); setOtherName(otherPersonName);
      setSecurityQuestion(o.question || ""); setSecurityAnswer(normalizedAnswer);
      sessionStorage.setItem("schplitzAnswer", normalizedAnswer);
      setStatuses(mergedStatuses);
      setSettlements(mergedSettlements);
      setExpenses(expenses); setInitialized(true);
      window.history.replaceState(null, "", window.location.pathname);
      showToast(`Imported ${expenses.length} expense${expenses.length !== 1 ? "s" : ""}!`);
    } catch (err) {
      console.error("Import failed");
      showToast(err.name === "OperationError" ? "Wrong answer or corrupted data" : `Import failed: ${err.message}`, "error");
    }
    setImporting(false);
  };

  const confirmAnswerPrompt = () => {
    if (!promptAnswer.trim()) return;
    const normalized = normalizeAnswer(promptAnswer);
    sessionStorage.setItem("schplitzAnswer", normalized);
    setSecurityAnswer(normalized);
    setPromptAnswer("");
    setModal("export");
  };

  const handleExport = async () => {
    if (!securityAnswer) { setPromptAnswer(""); setModal("enter-answer"); return; }
    if (!expenses.length) { showToast("Nothing to export yet", "info"); return; }
    setExporting(true);
    try {
      const encryptedData = {
        expenses: expenses.map(e => ({ i: e.id, d: e.description, a: e.amount, c: e.currency, p: e.paidBy, t: e.date })),
        status: exportStatus,
      };
      if (settlements[myName]) encryptedData.settlement = settlements[myName];
      const payload = {
        v: 4, question: securityQuestion, names: [myName, otherName],
        encrypted: await encryptCompressed(JSON.stringify(encryptedData), securityAnswer)
      };
      const compressed = await compressToUrl(JSON.stringify(payload));
      const url = `${window.location.origin}${window.location.pathname}#share=${compressed}`;
      if (url.length > 8000) {
        showToast("Too many expenses for a URL — text export used instead", "info");
        setExportResult(JSON.stringify(payload, null, 2)); setExportIsUrl(false);
      } else {
        setExportResult(url); setExportIsUrl(true);
      }
      setStatuses(prev => ({ ...prev, [myName]: exportStatus }));
    } catch { console.error("Export failed"); showToast("Export failed", "error"); }
    setExporting(false);
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(exportResult); }
    catch { if (taRef.current) { taRef.current.select(); document.execCommand("copy"); } }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
    showToast("Copied to clipboard");
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Schplitz tally", url: exportResult });
        return;
      } catch (err) {
        if (err.name === "AbortError") return; // user dismissed sheet
        // fall through to clipboard
      }
    }
    try { await navigator.clipboard.writeText(exportResult); }
    catch { if (taRef.current) { taRef.current.select(); document.execCommand("copy"); } }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
    showToast("Link copied to clipboard");
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

  const startNewTally = () => {
    setNewTallyStep(1);
    setModal("confirm-new");
  };

  const confirmStartNew = () => {
    localStorage.removeItem("schplitzExpenses");
    sessionStorage.removeItem("schplitzAnswer");
    window.history.replaceState(null, "", window.location.pathname);
    if (onResetToSetup) onResetToSetup(); // remounts ExpenseTracker fresh via key change
  };


  // ─── SETUP ───────────────────────────────────────────────────────────────

  if (!initialized) return (
    <div style={S.setupOverlay}>
      <div style={S.setupCard}>
        <div style={S.setupHeader}>
          <h2 style={S.setupTitle}>Welcome to Schplitz</h2>
          <p style={S.setupSub}>{setupMode === "import" ? "Enter your answer to decrypt the tally." : "Set up a new shared tally."}</p>
        </div>

        {setupMode === "new" && (
          <div style={S.setupForm}>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Your name</label>
              <input autoFocus value={setupMyName} onChange={e => setSetupMyName(e.target.value)} placeholder={`e.g., ${PLACEHOLDER_ME}`} maxLength={MAX_NAME_LEN} style={S.setupInput} />
            </div>
            <div style={S.setupField}>
              <label style={S.setupLabel}>Other person's name</label>
              <input value={setupOtherName} onChange={e => setSetupOtherName(e.target.value)} placeholder={`e.g., ${PLACEHOLDER_OTHER}`} maxLength={MAX_NAME_LEN} style={S.setupInput} />
            </div>
            <div style={S.setupDivider} />
            <div style={S.setupField}>
              <label style={S.setupLabel}>Security question</label>
              <input value={setupQuestion} onChange={e => setSetupQuestion(e.target.value)} placeholder="e.g., Where did we meet?" maxLength={MAX_QUESTION_LEN} style={S.setupInput} />
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
                <input value={setupMyName} onChange={e => setSetupMyName(e.target.value)} placeholder="Your name" maxLength={MAX_NAME_LEN} style={S.setupInput} />
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

      {modal === "confirm-new" && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <span style={S.modalTitle}>
                {newTallyStep === 1 ? "Step 1 of 2 — Share your changes" : "Step 2 of 2 — Start fresh"}
              </span>
              <button onClick={() => setModal(null)} style={S.modalX}><I.X /></button>
            </div>

            {newTallyStep === 1 ? (<>
              <p style={S.modalDesc}>
                Before starting a new tally, make sure {otherName} has your latest entries — otherwise they'll be gone for good.
              </p>
              <button onClick={() => { setPendingNewTally(true); setExportResult(""); setExportIsUrl(false); setExportStatus(statuses[myName] || "just_started"); setModal("export"); }}
                disabled={!expenses.length}
                style={{ ...S.copyBtn, ...(!expenses.length ? disabledStyle : {}) }}>
                <I.Up /> {`Share latest with ${otherName}`}
              </button>
              <button onClick={() => setNewTallyStep(2)}
                style={{ ...S.copyBtn, marginTop: 8, background: "transparent", border: "1px solid #2e2e3e", color: "#6a6a7a" }}>
                {expenses.length === 0 ? "Nothing to share — continue" : "I've already shared — continue"}
              </button>
            </>) : (<>
              <p style={S.modalDesc}>
                This will permanently erase your current tally with {otherName}. Any unshared expenses will be lost.
              </p>
              <button onClick={confirmStartNew} style={S.copyBtn}>
                Yes, start a new tally
              </button>
              <button onClick={() => setModal(null)}
                style={{ ...S.copyBtn, marginTop: 8, background: "transparent", border: "1px solid #2e2e3e", color: "#aaa" }}>
                Cancel — keep this tally
              </button>
            </>)}
          </div>
        </div>
      )}

      {modal === "enter-answer" && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <span style={S.modalTitle}>Enter your answer to share</span>
              <button onClick={() => setModal(null)} style={S.modalX}><I.X /></button>
            </div>
            <p style={S.modalDesc}>{securityQuestion || "Security question"}</p>
            <input
              autoFocus
              type="password"
              value={promptAnswer}
              onChange={e => setPromptAnswer(e.target.value.toLowerCase().replace(/\s/g, ""))}
              placeholder="lowercase, no spaces"
              style={{ ...S.setupInput, marginBottom: 12 }}
              onKeyDown={e => { if (e.key === "Enter") confirmAnswerPrompt(); }}
            />
            <button
              onClick={confirmAnswerPrompt}
              disabled={!promptAnswer.trim()}
              style={{ ...S.copyBtn, ...(!promptAnswer.trim() ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>
              Continue
            </button>
          </div>
        </div>
      )}

      {modal === "export" && (
        <div style={S.overlay} onClick={() => { if (pendingNewTally) { setPendingNewTally(false); setNewTallyStep(1); setModal("confirm-new"); } else { setModal(null); } }}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalHdr}>
              <span style={S.modalTitle}>Share with {otherName}</span>
              <button onClick={() => { if (pendingNewTally) { setPendingNewTally(false); setNewTallyStep(1); setModal("confirm-new"); } else { setModal(null); } }} style={S.modalX}><I.X /></button>
            </div>
            {!exportResult ? (
              <>
                <p style={S.modalDesc}>How far along are you with your expenses?</p>
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
                  <I.Link /> {exporting ? "Generating..." : "Generate Link"}
                </button>
              </>
            ) : exportIsUrl ? (
              <button onClick={async () => { await handleShare(); if (pendingNewTally) { setPendingNewTally(false); setNewTallyStep(2); setModal("confirm-new"); } }} style={S.copyBtn}>
                {copied ? <><I.Chk /> Copied!</> : <><I.Link /> Share Link</>}
              </button>
            ) : (
              <>
                <p style={{ ...S.modalDesc, marginBottom: 8 }}>Too many expenses for a URL — copy this encrypted text instead.</p>
                <textarea ref={taRef} readOnly value={exportResult} style={S.expTA} />
                <button onClick={handleCopy} style={S.copyBtn}>
                  {copied ? <><I.Chk /> Copied!</> : <><I.Copy /> Copy Text</>}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <header style={S.header}>
        <span style={S.hdrName}><I.User /> {myName}</span>
        <button onClick={() => { setExportResult(""); setExportIsUrl(false); setExportStatus(statuses[myName] || "just_started"); setModal("export"); }} style={S.hdrBtnExp}>
          <I.Up /> Share
        </button>
      </header>

      {summary && (
        <div style={S.sumWrap}>
          <div style={S.sumCard}>
            <div style={S.sumTop}>
              <span style={S.sumLabel}>Balance (EUR)</span>
            </div>
            <div style={S.statusRow}>
              <div style={S.statusItem}>
                <span style={S.statusPerson}>{myName}</span>
                <span style={S.statusBadge}>{STATUS_OPTIONS.find(s => s.value === (statuses[myName] || "just_started"))?.label}</span>
              </div>
              <div style={S.statusItem}>
                <span style={S.statusPerson}>{otherName}</span>
                <span style={S.statusBadge}>{statuses[otherName] ? STATUS_OPTIONS.find(s => s.value === statuses[otherName])?.label : "No update yet"}</span>
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

      {summary && statuses[myName] === "done" && statuses[otherName] === "done" && (
        <div style={S.sumWrap}>
          <div style={S.settleCard}>
            <div style={S.settleHdr}>
              <I.Settled />
              <span style={S.settleTitle}>Settlement</span>
            </div>

            {summary.myBalance === 0 ? (
              <p style={S.settleEven}>You're all even — no settlement needed.</p>
            ) : (<>
              {/* Counterparty's proposal (if they sent one) */}
              {settlements[otherName] && (
                <div style={S.settleProposal}>
                  <span style={S.settleProposalLabel}>{otherName}'s proposal</span>
                  <p style={S.settleProposalText}>{settlements[otherName]}</p>
                </div>
              )}

              {/* User's own settlement message */}
              {settlements[myName] && !settlementDraft ? (
                <div style={S.settleMine}>
                  <span style={S.settleProposalLabel}>Your proposal</span>
                  <p style={S.settleProposalText}>{settlements[myName]}</p>
                  <button onClick={() => setSettlementDraft(settlements[myName])} style={S.settleEditBtn}>Edit</button>
                </div>
              ) : (
                <div style={S.settleForm}>
                  <p style={S.settlePrompt}>
                    {summary.myBalance < 0
                      ? <>You owe <strong style={S.owesA}>{fmt(Math.abs(summary.myBalance), "EUR")}</strong> — tell {otherName} how you'll pay</>
                      : <>{otherName} owes you <strong style={S.owesA}>{fmt(Math.abs(summary.myBalance), "EUR")}</strong> — tell them how you'd like to be paid</>}
                  </p>
                  <p style={S.settleHint}>
                    {summary.myBalance < 0
                      ? "Describe your payment method: cash handoff, bank transfer, payment app, gift card, etc."
                      : "Share your preferred payment method: bank details, payment app handle, or suggest meeting in person."}
                  </p>
                  <textarea
                    value={settlementDraft}
                    onChange={e => setSettlementDraft(e.target.value.slice(0, MAX_SETTLEMENT_LEN))}
                    placeholder={summary.myBalance < 0 ? settlePlaceholderDebtor : settlePlaceholderCreditor}
                    style={S.settleTextarea}
                    rows={3}
                  />
                  <span style={S.settleCharCount}>{settlementDraft.length}/{MAX_SETTLEMENT_LEN}</span>
                  <button
                    onClick={() => {
                      if (!settlementDraft.trim()) return;
                      setSettlements(prev => ({ ...prev, [myName]: settlementDraft.trim() }));
                      setSettlementDraft("");
                      setExportResult(""); setExportIsUrl(false); setExportStatus("done"); setModal("export");
                    }}
                    disabled={!settlementDraft.trim()}
                    style={{ ...S.copyBtn, ...(!settlementDraft.trim() ? disabledStyle : {}) }}>
                    <I.Up /> Save & Share
                  </button>
                </div>
              )}
            </>)}
          </div>
        </div>
      )}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={S.addBtn}><I.Plus /> Add Expense</button>
      ) : (
        <div style={S.formCard}>
          <div style={S.fRow}>
            <input autoFocus placeholder="What was it for?" value={form.description} maxLength={30}
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
                {e.currency !== "EUR" && <span style={S.expAmtEur}>{eurAmounts[e.id] != null ? `≈ ${fmt(eurAmounts[e.id], "EUR")}` : "converting..."}</span>}
              </div>
              <button onClick={() => setExpenses(p => p.filter(x => x.id !== e.id))} style={S.delBtn} title="Delete">
                <I.Trash />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        <button onClick={startNewTally} style={S.resetBtn}>Start a new tally</button>
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────

export default function Schplitz() {
  const getInitialView = () => {
    if (window.location.hash.startsWith("#share=")) return "app";
    try { const s = localStorage.getItem("schplitzExpenses"); if (s && JSON.parse(s).initialized) return "app"; } catch {}
    return sessionStorage.getItem("schplitz_launched") === "1" ? "app" : "landing";
  };
  const [view, setView] = useState(getInitialView);
  const [resetKey, setResetKey] = useState(0);
  const launchApp = () => { sessionStorage.setItem("schplitz_launched", "1"); setView("app"); };
  const startFresh = () => { setView("app"); setResetKey(k => k + 1); };
  if (view === "app") return <ExpenseTracker key={resetKey} onResetToSetup={startFresh} />;
  return <LandingPage onLaunch={launchApp} />;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  setupOverlay:    { position: "fixed", inset: 0, background: "#0f0f13", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 },
  setupCard:       { background: "#1a1a24", border: "1px solid #2a2a3a", borderRadius: 20, padding: "32px 28px", maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" },
  setupHeader:     { textAlign: "center", marginBottom: 32 },
  setupTitle:      { fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 8px", fontFamily: "Georgia,serif" },
  setupSub:        { fontSize: 14, color: "#7a7a8a", margin: 0 },
  setupForm:       { display: "flex", flexDirection: "column", gap: 16 },
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
  sumLabel:        { fontSize: 12, color: "#6a6a7a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" },
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

  settleCard:        { background: "#1a1a24", border: "1px solid #2a3a2a", borderRadius: 14, padding: 18 },
  settleHdr:         { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  settleTitle:       { fontSize: 14, fontWeight: 700, color: "#4caf50", textTransform: "uppercase", letterSpacing: "0.8px" },
  settleEven:        { fontSize: 14, color: "#8a8a9a", margin: 0, textAlign: "center", padding: "8px 0" },
  settleProposal:    { background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 10, padding: 14, marginBottom: 14 },
  settleProposalLabel:{ fontSize: 11, color: "#6a6a7a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 6 },
  settleProposalText:{ fontSize: 14, color: "#ddd", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  settleMine:        { background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 10, padding: 14 },
  settleEditBtn:     { background: "none", border: "none", color: "#e8d44d", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 8, padding: 0, textDecoration: "underline", textUnderlineOffset: 2 },
  settleForm:        { display: "flex", flexDirection: "column", gap: 8 },
  settlePrompt:      { fontSize: 13, color: "#aaa", margin: 0, lineHeight: 1.5 },
  settleHint:        { fontSize: 12, color: "#5a5a6a", margin: 0, lineHeight: 1.4, fontStyle: "italic" },
  settleTextarea:    { padding: "12px 14px", background: "#12121a", border: "1px solid #2e2e3e", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, minHeight: 72 },
  settleCharCount:   { fontSize: 11, color: "#4a4a5a", alignSelf: "flex-end", marginTop: -4 },
};

