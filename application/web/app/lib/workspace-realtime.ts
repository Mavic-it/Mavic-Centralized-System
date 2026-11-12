/** One credentialed SSE connection per browser tab, shared by every module. */
export function createRealtimeClient() {
  const listeners = new Set<() => void>();
  let source: EventSource | undefined;
  let connected = false;
  let pending = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setInterval> | undefined;
  let lastHeartbeat = 0;

  const flush = () => {
    refreshTimer = undefined;
    if (document.visibilityState === "hidden") {
      pending = true;
      return;
    }
    pending = false;
    // A subscriber's failure must not prevent other caches/views refreshing.
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* Isolated view refresh failure. */
      }
    }
  };
  const changed = () => {
    pending = true;
    if (!refreshTimer) refreshTimer = setTimeout(flush, 500);
  };
  const connect = () => {
    if (source || typeof EventSource === "undefined") return;
    source = new EventSource("/api/realtime/events");
    source.onopen = () => {
      connected = true;
      lastHeartbeat = Date.now();
      // Includes reconnect: refresh missed changes without replaying private events.
      changed();
    };
    source.addEventListener("refresh", changed);
    source.addEventListener("ping", () => {
      lastHeartbeat = Date.now();
    });
    source.onerror = () => {
      connected = false;
      if (source?.readyState === EventSource.CLOSED) {
        source.close();
        source = undefined;
      }
    };
  };
  const onVisible = () => {
    if (document.visibilityState !== "hidden") {
      if (pending) flush();
      else changed();
      connect();
    }
  };
  const start = () => {
    connect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    fallbackTimer = setInterval(() => {
      if (connected && Date.now() - lastHeartbeat > 60_000) {
        source?.close();
        source = undefined;
        connected = false;
      }
      if (!connected) {
        changed();
        connect();
      }
    }, 30_000);
  };
  const stop = () => {
    source?.close();
    source = undefined;
    connected = false;
    pending = false;
    clearInterval(fallbackTimer);
    clearTimeout(refreshTimer);
    fallbackTimer = undefined;
    refreshTimer = undefined;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onVisible);
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stop();
      };
    },
  };
}

export const workspaceRealtime = createRealtimeClient();
