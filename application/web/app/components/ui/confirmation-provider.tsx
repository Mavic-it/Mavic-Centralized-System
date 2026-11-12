"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CircleAlert, X } from "lucide-react";
import { Modal } from "./modal";
import {
  ConfirmationQueue,
  type ConfirmationOptions,
} from "./confirmation-queue";

const ConfirmationContext = createContext<
  ((options: ConfirmationOptions) => Promise<boolean>) | null
>(null);
const emptySnapshot = () => null;

function ConfirmationDialog({
  options,
  onResolve,
}: {
  options: ConfirmationOptions;
  onResolve: (confirmed: boolean) => void;
}) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const danger = options.tone === "danger";
  return (
    <Modal
      presentation="center"
      className="app-confirmation"
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      initialFocusRef={cancel}
      onClose={() => onResolve(false)}
    >
      <div className="app-confirmation-heading">
        <span
          className={`app-confirmation-icon${danger ? " app-confirmation-icon-danger" : ""}`}
          aria-hidden="true"
        >
          <CircleAlert size={21} />
        </span>
        <button
          type="button"
          className="app-modal-close"
          aria-label="Close confirmation"
          onClick={() => onResolve(false)}
        >
          <X size={19} />
        </button>
      </div>
      <h2 id={`${id}-title`}>{options.title}</h2>
      <p id={`${id}-description`} className="app-confirmation-description">
        {options.description}
      </p>
      <div className="app-confirmation-actions">
        <button
          ref={cancel}
          type="button"
          className="app-modal-secondary"
          onClick={() => onResolve(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`app-modal-primary${danger ? " app-modal-danger" : ""}`}
          onClick={() => onResolve(true)}
        >
          {options.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new ConfirmationQueue());
  const active = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    emptySnapshot,
  );
  useEffect(() => () => queue.cancelAll(), [queue]);
  return (
    <ConfirmationContext.Provider value={queue.request}>
      {children}
      {active && (
        <ConfirmationDialog
          key={active.id}
          options={active.options}
          onResolve={(confirmed) => queue.settle(active.id, confirmed)}
        />
      )}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const confirmation = useContext(ConfirmationContext);
  if (!confirmation)
    throw new Error("useConfirmation must be used inside DialogProvider.");
  return confirmation;
}
