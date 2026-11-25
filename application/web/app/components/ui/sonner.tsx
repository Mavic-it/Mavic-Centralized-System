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

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function Toaster(props: ToasterProps) {
  const modal = useSyncExternalStore(
    subscribeToModals,
    getTopModal,
    getServerModal,
  );
  const theme: "light" | "dark" = useSyncExternalStore(
    subscribeToTheme,
    getTheme,
    () => "light" as const,
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
          "--success-bg": "var(--success)",
          "--success-border": "color-mix(in srgb, var(--status-success) 25%, var(--border))",
          "--success-text": "var(--success-foreground)",
          "--error-bg": "var(--danger-soft)",
          "--error-border": "color-mix(in srgb, var(--status-danger) 25%, var(--border))",
          "--error-text": "var(--status-danger)",
        } as CSSProperties
      }
      theme={theme}
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
