"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { getServerModal, getTopModal, subscribeToModals } from "./modal-layer";

export function Toaster(props: ToasterProps) {
  const modal = useSyncExternalStore(
    subscribeToModals,
    getTopModal,
    getServerModal,
  );
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const attachHost = useCallback((marker: HTMLSpanElement | null) => {
    if (!marker) return;
    const element = document.createElement("div");
    element.dataset.toastHost = "";
    document.body.append(element);
    setHost(element);
    return () => element.remove();
  }, []);
  useLayoutEffect(() => {
    // Move the same portal host so existing notifications and timers survive.
    if (host) (modal ?? document.body).append(host);
  }, [host, modal]);
  const toaster = (
    <Sonner
      closeButton
      className="toaster group"
      duration={5000}
      position="top-right"
      richColors
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "#f2f8f4",
          "--success-border": "#d8e9de",
          "--success-text": "var(--success-foreground)",
          "--error-bg": "#fff6f5",
          "--error-border": "#f2d9d8",
          "--error-text": "var(--primary-dark)",
        } as CSSProperties
      }
      theme="light"
      {...props}
    />
  );
  return (
    <>
      <span hidden ref={attachHost} aria-hidden="true" />
      {host ? createPortal(toaster, host) : null}
    </>
  );
}
