// What a visitor sees first: the landing page for newcomers, the app for everyone else.
import { useState } from "react";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import { V1_STORAGE_KEY } from "../migrate.js";

import { USED_KEY, OPENED_KEY } from "./visits.js";

const read = (storage, key) => { try { return storage?.getItem(key); } catch { return null; } };

/**
 * Skip the landing page when the visitor arrives with a link, already uses Schplitz 2 on
 * this phone, has Schplitz 1 data to bring in, or went past it earlier in this tab.
 */
export function skipLanding({ hash = location.hash, local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) {
  return hash.startsWith("#s=") || hash.startsWith("#share=")
    || Boolean(read(local, USED_KEY)) || Boolean(read(local, V1_STORAGE_KEY)) || Boolean(read(session, OPENED_KEY));
}

export default function Site(props) {
  const [inApp, setInApp] = useState(() => (skipLanding() ? "home" : null));
  if (inApp) return <App {...props} firstView={inApp} />;
  return (
    <Landing onOpen={(target) => {
      try { sessionStorage.setItem(OPENED_KEY, "1"); } catch { /* private mode: the landing page shows again next time */ }
      window.scrollTo(0, 0);
      setInApp(target);
    }} />
  );
}
