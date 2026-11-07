import { useEffect, useRef, useState } from "react";
import { openCache, requestPersistence } from "../cache.js";

export const linkOrigin = () => `${location.origin}${location.pathname.replace(/\/[^/]*$/, "")}`;

/** Consume incoming links so reloading does not open them a second time. */
function takeLinkFromAddressBar() {
  if (!location.hash.startsWith("#s=") && !location.hash.startsWith("#share=")) return null;
  const url = location.href;
  history.replaceState(null, "", location.pathname + location.search);
  return url;
}

/** Own the cache connection and browser subscriptions for one mounted app. */
export function useBrowserSession({ cacheName, onReady, onLocation, onOtherTab, onError }) {
  const handlers = useRef();
  handlers.current = { onReady, onLocation, onOtherTab, onError };

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const cleanups = [];
    const reportError = (error) => { if (!signal.aborted) handlers.current.onError(error); };
    // Link merges and tab reloads must finish in arrival order. A failed event
    // reports its error without preventing the next event from running.
    let pending = Promise.resolve();
    const run = task => {
      pending = pending.then(() => signal.aborted ? undefined : task()).catch(reportError);
    };
    (async () => {
      const cache = await openCache(cacheName);
      if (signal.aborted) { cache.close(); return; }
      cleanups.push(() => cache.close());
      requestPersistence();
      await handlers.current.onReady(cache, signal);
      if (signal.aborted) return;
      const initialUrl = takeLinkFromAddressBar();
      run(() => handlers.current.onLocation(cache, initialUrl, signal));

      // Subscribe before opening the initial link: decryption and storage can
      // take long enough for another link or tab notification to arrive.

      const onHash = () => {
        const url = takeLinkFromAddressBar();
        if (url) run(() => handlers.current.onLocation(cache, url, signal));
      };
      window.addEventListener("hashchange", onHash);
      cleanups.push(() => window.removeEventListener("hashchange", onHash));
      cleanups.push(cache.onOtherTabChange(id => {
        run(() => handlers.current.onOtherTab(cache, id, signal));
      }));
    })().catch(reportError);
    return () => {
      controller.abort();
      cleanups.reverse().forEach(cleanup => cleanup());
    };
  }, [cacheName]);
}

/** Android/desktop install events; iOS does not provide an install prompt. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setPrompt(event); };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    setPrompt(null);
  }
  return { canInstall: Boolean(prompt), install };
}
