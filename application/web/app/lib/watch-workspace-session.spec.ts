import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchWorkspaceSession } from "./watch-workspace-session";

describe("workspace session monitor", () => {
  let stop: (() => void) | undefined;
  let browser: EventTarget;
  let page: EventTarget;
  const request = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
    browser = new EventTarget();
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", page);
    vi.stubGlobal("fetch", request);
    request.mockReset();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("redirects an idle page at the server expiry and stops after cleanup", async () => {
    request.mockResolvedValue({ ok: true, status: 200, json: async () => ({
      expiresAt: "2026-10-15T00:00:10Z",
    }) });
    const expired = vi.fn();
    stop = watchWorkspaceSession(expired);
    await vi.advanceTimersByTimeAsync(9999);
    expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(expired).toHaveBeenCalledTimes(1);
    stop();
    browser.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("detects invalid sessions on focus or visibility changes", async () => {
    request.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const expired = vi.fn();
    stop = watchWorkspaceSession(expired);
    await vi.advanceTimersByTimeAsync(0);
    request.mockResolvedValue({ ok: false, status: 401 });
    browser.dispatchEvent(new Event("focus"));
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("retries server and network failures without signing out", async () => {
    request.mockRejectedValueOnce(new Error("Offline"));
    request.mockResolvedValueOnce({ ok: false, status: 503 });
    request.mockResolvedValueOnce({ ok: false, status: 401 });
    const expired = vi.fn();
    stop = watchWorkspaceSession(expired);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("cancels pending requests and timers on unmount", async () => {
    let resolve: (value: unknown) => void = () => {};
    request.mockReturnValue(new Promise((done) => { resolve = done; }));
    const expired = vi.fn();
    stop = watchWorkspaceSession(expired);
    const signal = request.mock.calls[0][1].signal as AbortSignal;
    stop();
    expect(signal.aborted).toBe(true);
    resolve({ ok: false, status: 401 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(expired).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
