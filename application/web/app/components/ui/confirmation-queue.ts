export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "default";
};

type Request = {
  id: number;
  options: ConfirmationOptions;
  resolve: (confirmed: boolean) => void;
};

/** Keeps concurrent confirmations ordered and prevents stale dialogs resolving newer requests. */
export class ConfirmationQueue {
  private requests: Request[] = [];
  private listeners = new Set<() => void>();
  private nextId = 0;

  getSnapshot = () => this.requests[0] ?? null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    this.listeners.forEach((listener) => listener());
  }

  request = (options: ConfirmationOptions): Promise<boolean> =>
    new Promise((resolve) => {
      this.requests.push({ id: ++this.nextId, options, resolve });
      this.publish();
    });

  settle = (id: number, confirmed: boolean) => {
    if (this.requests[0]?.id !== id) return;
    const request = this.requests.shift()!;
    request.resolve(confirmed);
    this.publish();
  };

  cancelAll = () => {
    const requests = this.requests;
    this.requests = [];
    requests.forEach((request) => request.resolve(false));
    this.publish();
  };
}
