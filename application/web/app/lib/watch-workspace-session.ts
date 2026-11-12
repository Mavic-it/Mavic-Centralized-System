import { handleApiUnauthorized } from "./handle-api-unauthorized";

// Validate idle sessions too, and re-check when a suspended tab becomes active.
export function watchWorkspaceSession(
  onExpired: () => void = () => handleApiUnauthorized(401),
): () => void {
  let stopped = false;
  let pending = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();

  function expire() {
    if (stopped) return;
    stopped = true;
    onExpired();
  }

  async function check() {
    if (stopped || pending) return;
    pending = true;
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (stopped) return;
      if (response.status === 401) {
        expire();
        return;
      }
      if (!response.ok) return;
      const session = await response.json() as { expiresAt?: string };
      if (stopped) return;
      const expiresAt = Date.parse(session.expiresAt ?? "");
      if (!Number.isFinite(expiresAt)) return;
      clearTimeout(expiryTimer);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) expire();
      else expiryTimer = setTimeout(expire, remaining);
    } catch {
      // Network failures are retried; they do not prove authentication expired.
    } finally {
      pending = false;
    }
  }

  function onVisible() {
    if (document.visibilityState === "visible") void check();
  }

  void check();
  const interval = setInterval(() => void check(), 60_000);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    controller.abort();
    clearInterval(interval);
    clearTimeout(expiryTimer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
