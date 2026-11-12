"use client";

import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type RefObject,
} from "react";
import { registerModal } from "./modal-layer";

type ModalProps = Omit<
  ComponentPropsWithoutRef<"dialog">,
  "open" | "onClose" | "onCancel"
> & {
  onClose: () => void;
  busy?: boolean;
  presentation?: "drawer" | "center";
  initialFocusRef?: RefObject<HTMLElement | null>;
};

let scrollLocks = 0;
let previousOverflow = "";

/** Mount to open. Native modal dialogs isolate the background and stack safely. */
export function Modal({
  onClose,
  busy = false,
  presentation = "drawer",
  initialFocusRef,
  className = "",
  children,
  ...props
}: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pointerStartedOutside = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement;
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    element.showModal();
    const unregister = registerModal(element);
    (initialFocusRef?.current ?? element).focus();
    return () => {
      unregister();
      element.close();
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [initialFocusRef]);

  function isOutside(
    event:
      | React.MouseEvent<HTMLDialogElement>
      | React.PointerEvent<HTMLDialogElement>,
  ) {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }

  return (
    <dialog
      {...props}
      data-presentation={presentation}
      ref={dialog}
      tabIndex={-1}
      aria-modal="true"
      aria-busy={busy}
      className={`app-modal ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!busy && !event.repeat) onClose();
        }
        props.onKeyDown?.(event);
      }}
      onPointerDown={(event) => {
        pointerStartedOutside.current = isOutside(event);
        props.onPointerDown?.(event);
      }}
      onClick={(event) => {
        if (pointerStartedOutside.current && isOutside(event) && !busy)
          onClose();
        pointerStartedOutside.current = false;
        props.onClick?.(event);
      }}
    >
      {children}
    </dialog>
  );
}
