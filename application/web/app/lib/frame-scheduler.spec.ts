import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrameScheduler } from "./frame-scheduler";

afterEach(() => vi.unstubAllGlobals());

describe("layout frame scheduling", () => {
  it("coalesces event bursts and permits another measurement next frame", () => {
    const pending: FrameRequestCallback[] = [];
    const request = vi.fn((callback: FrameRequestCallback) => pending.push(callback));
    vi.stubGlobal("window", { requestAnimationFrame: request, cancelAnimationFrame: vi.fn() });
    const measure = vi.fn();
    const scheduler = createFrameScheduler(measure);
    for (let index = 0; index < 100; index++) scheduler.schedule();
    expect(request).toHaveBeenCalledTimes(1);
    pending.shift()!(0);
    expect(measure).toHaveBeenCalledTimes(1);
    scheduler.schedule();
    pending.shift()!(16);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("cancels pending measurements and ignores events after unmount", () => {
    let pending: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    vi.stubGlobal("window", { requestAnimationFrame: (callback: FrameRequestCallback) => { pending = callback; return 1; }, cancelAnimationFrame: cancel });
    const measure = vi.fn();
    const scheduler = createFrameScheduler(measure);
    scheduler.schedule();
    scheduler.dispose();
    pending!(0);
    scheduler.schedule();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(measure).not.toHaveBeenCalled();
  });
});
