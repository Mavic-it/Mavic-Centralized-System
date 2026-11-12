import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeClient } from "./workspace-realtime";

class FakeSource extends EventTarget {
  static CLOSED = 2;
  static instances: FakeSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 2;
  });
  constructor(readonly url: string) {
    super();
    FakeSource.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}
let visibility = "visible";
let doc: EventTarget;
const cleanup: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  FakeSource.instances = [];
  visibility = "visible";
  doc = new EventTarget();
  Object.defineProperty(doc, "visibilityState", { get: () => visibility });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("EventSource", FakeSource);
});
afterEach(() => {
  cleanup.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Shared workspace refresh transport", () => {
  it("shares one connection across modules and coalesces update bursts", async () => {
    const client = createRealtimeClient();
    const first = vi.fn(),
      second = vi.fn();
    cleanup.push(client.subscribe(first), client.subscribe(second));
    expect(FakeSource.instances).toHaveLength(1);
    const source = FakeSource.instances[0];
    expect(source.url).toBe("/api/realtime/events");
    source.open();
    source.dispatchEvent(new Event("refresh"));
    source.dispatchEvent(new Event("refresh"));
    await vi.advanceTimersByTimeAsync(500);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    source.dispatchEvent(new Event("ping"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(first).toHaveBeenCalledTimes(1);
  });
  it("defers hidden tabs, then catches up without refreshing forms repeatedly", async () => {
    const client = createRealtimeClient();
    const refresh = vi.fn();
    cleanup.push(client.subscribe(refresh));
    FakeSource.instances[0].open();
    visibility = "hidden";
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).not.toHaveBeenCalled();
    visibility = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("uses periodic fallback after a disconnect and refreshes on reconnect", async () => {
    const client = createRealtimeClient();
    const refresh = vi.fn();
    cleanup.push(client.subscribe(refresh));
    const source = FakeSource.instances[0];
    source.readyState = 2;
    source.onerror?.();
    await vi.advanceTimersByTimeAsync(30_500);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeSource.instances).toHaveLength(2);
    FakeSource.instances[1].open();
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it("replaces a stalled connection and releases timers/listeners on last unsubscribe", async () => {
    const client = createRealtimeClient();
    const refresh = vi.fn();
    const stop = client.subscribe(refresh);
    const source = FakeSource.instances[0];
    source.open();
    await vi.advanceTimersByTimeAsync(90_500);
    expect(source.close).toHaveBeenCalled();
    expect(FakeSource.instances).toHaveLength(2);
    stop();
    const count = refresh.mock.calls.length;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(FakeSource.instances[1].close).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(count);
  });
  it("falls back when EventSource is unavailable and isolates a broken subscriber", async () => {
    vi.stubGlobal("EventSource", undefined);
    const client = createRealtimeClient();
    const good = vi.fn();
    cleanup.push(
      client.subscribe(() => {
        throw new Error("view failed");
      }),
      client.subscribe(good),
    );
    await vi.advanceTimersByTimeAsync(30_500);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
