// Coalesce high-frequency scroll/resize events into one layout pass per frame.
export function createFrameScheduler(callback: () => void) {
  let frame: number | null = null;
  let disposed = false;
  return {
    schedule() {
      if (disposed || frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!disposed) callback();
      });
    },
    dispose() {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
