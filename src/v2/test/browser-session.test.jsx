import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { openCache } from "../cache.js";
import { useBrowserSession, useInstallPrompt } from "../ui/useBrowserSession.js";

vi.mock("../cache.js", () => ({ openCache: vi.fn(), requestPersistence: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  history.replaceState(null, "", "/v2/");
});
afterEach(cleanup);

function session() {
  let notify;
  const unsubscribe = vi.fn();
  const cache = {
    close: vi.fn(),
    onOtherTabChange: vi.fn(listener => { notify = listener; return unsubscribe; }),
  };
  const handlers = { onReady: vi.fn(), onLocation: vi.fn(), onOtherTab: vi.fn(), onError: vi.fn() };
  return { cache, handlers, unsubscribe, notify: id => notify(id) };
}

it("closes a cache that finishes opening after unmount", async () => {
  const pending = Promise.withResolvers();
  const { cache, handlers } = session();
  openCache.mockReturnValue(pending.promise);
  const { unmount } = renderHook(() => useBrowserSession(handlers));
  unmount();
  await act(async () => pending.resolve(cache));
  expect(cache.close).toHaveBeenCalledOnce();
  expect(handlers.onReady).not.toHaveBeenCalled();
  expect(cache.onOtherTabChange).not.toHaveBeenCalled();
});

it("leaves the incoming link intact when startup is interrupted", async () => {
  const pending = Promise.withResolvers();
  const { cache, handlers } = session();
  history.replaceState(null, "", "/v2/#s=incoming");
  openCache.mockResolvedValue(cache);
  handlers.onReady.mockReturnValue(pending.promise);
  const { unmount } = renderHook(() => useBrowserSession(handlers));
  await waitFor(() => expect(handlers.onReady).toHaveBeenCalledOnce());
  const signal = handlers.onReady.mock.calls[0][1];
  unmount();
  await act(async () => pending.resolve());
  expect(signal.aborted).toBe(true);
  expect(location.hash).toBe("#s=incoming");
  expect(handlers.onLocation).not.toHaveBeenCalled();
  expect(cache.close).toHaveBeenCalledOnce();
});

it("uses current handlers without reopening and removes subscriptions on unmount", async () => {
  const { cache, handlers, unsubscribe, notify } = session();
  openCache.mockResolvedValue(cache);
  const { rerender, unmount } = renderHook(props => useBrowserSession(props), { initialProps: handlers });
  await waitFor(() => expect(cache.onOtherTabChange).toHaveBeenCalledOnce());
  const next = { ...handlers, onLocation: vi.fn(), onOtherTab: vi.fn() };
  rerender(next);
  await act(async () => {
    history.replaceState(null, "", "/v2/#share=incoming");
    window.dispatchEvent(new Event("hashchange"));
    notify("tally-id");
  });
  expect(openCache).toHaveBeenCalledOnce();
  expect(next.onLocation).toHaveBeenCalledWith(cache, expect.stringContaining("#share=incoming"), expect.any(AbortSignal));
  expect(location.hash).toBe("");
  expect(next.onOtherTab).toHaveBeenCalledWith(cache, "tally-id", expect.any(AbortSignal));
  expect(handlers.onOtherTab).not.toHaveBeenCalled();
  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(cache.close).toHaveBeenCalledOnce();
  await act(async () => {
    history.replaceState(null, "", "/v2/#s=later");
    window.dispatchEvent(new Event("hashchange"));
    notify("later");
  });
  expect(location.hash).toBe("#s=later");
  expect(next.onLocation).toHaveBeenCalledOnce();
  expect(next.onOtherTab).toHaveBeenCalledOnce();
});

it("reports startup and asynchronous notification failures", async () => {
  const { cache, handlers, notify } = session();
  const error = new Error("Unavailable");
  openCache.mockRejectedValueOnce(error);
  const first = renderHook(() => useBrowserSession(handlers));
  await waitFor(() => expect(handlers.onError).toHaveBeenCalledWith(error));
  first.unmount();
  handlers.onError.mockClear();
  openCache.mockResolvedValue(cache);
  handlers.onOtherTab.mockRejectedValue(error);
  renderHook(() => useBrowserSession(handlers));
  await waitFor(() => expect(cache.onOtherTabChange).toHaveBeenCalledOnce());
  await act(async () => notify("tally-id"));
  expect(handlers.onError).toHaveBeenCalledWith(error);
});

it("handles StrictMode replay with one active cache and one consumed link", async () => {
  const first = session(), second = session();
  history.replaceState(null, "", "/v2/#s=incoming");
  openCache.mockResolvedValueOnce(first.cache).mockResolvedValueOnce(second.cache);
  const { unmount } = renderHook(() => useBrowserSession(second.handlers), { wrapper: StrictMode });
  await waitFor(() => expect(second.cache.onOtherTabChange).toHaveBeenCalledOnce());
  expect(first.cache.close).toHaveBeenCalledOnce();
  expect(first.cache.onOtherTabChange).not.toHaveBeenCalled();
  expect(second.handlers.onLocation).toHaveBeenCalledOnce();
  expect(second.handlers.onLocation.mock.calls[0][1]).toContain("#s=incoming");
  unmount();
  expect(second.cache.close).toHaveBeenCalledOnce();
});

it("offers the browser install prompt and clears it after use or installation", async () => {
  const { result, unmount } = renderHook(useInstallPrompt);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = vi.fn().mockResolvedValue();
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(result.current.canInstall).toBe(true);
  await act(() => result.current.install());
  expect(event.prompt).toHaveBeenCalledOnce();
  expect(result.current.canInstall).toBe(false);
  act(() => window.dispatchEvent(event));
  act(() => window.dispatchEvent(new Event("appinstalled")));
  expect(result.current.canInstall).toBe(false);
  unmount();
  const later = new Event("beforeinstallprompt", { cancelable: true });
  window.dispatchEvent(later);
  expect(later.defaultPrevented).toBe(false);
});

it("does not lose a second link while the initial link is still opening", async () => {
  const pending = Promise.withResolvers();
  const { cache, handlers } = session();
  const opened = [];
  history.replaceState(null, "", "/v2/#s=first");
  openCache.mockResolvedValue(cache);
  handlers.onLocation.mockImplementation(async (_cache, url) => {
    if (url.endsWith("#s=first")) await pending.promise;
    opened.push(url);
  });
  renderHook(() => useBrowserSession(handlers));
  await waitFor(() => expect(handlers.onLocation).toHaveBeenCalledOnce());
  await act(async () => {
    history.replaceState(null, "", "/v2/#s=second");
    window.dispatchEvent(new Event("hashchange"));
  });
  await act(async () => pending.resolve());
  await waitFor(() => expect(opened.map(url => new URL(url).hash)).toEqual(["#s=first", "#s=second"]));
  expect(location.hash).toBe("");
});

it("processes browser notifications in order and continues after a failure", async () => {
  const pending = Promise.withResolvers();
  const { cache, handlers, notify } = session();
  const error = new Error("read failed");
  openCache.mockResolvedValue(cache);
  handlers.onOtherTab.mockImplementationOnce(async () => { await pending.promise; throw error; });
  renderHook(() => useBrowserSession(handlers));
  await waitFor(() => expect(cache.onOtherTabChange).toHaveBeenCalledOnce());
  await act(async () => { notify("first"); notify("second"); });
  expect(handlers.onOtherTab).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve());
  expect(handlers.onError).toHaveBeenCalledWith(error);
  expect(handlers.onOtherTab.mock.calls.map(call => call[1])).toEqual(["first", "second"]);
});
