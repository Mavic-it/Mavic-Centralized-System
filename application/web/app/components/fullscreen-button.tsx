"use client";

import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { IconActionButton } from "./icon-action-button";
import { notifyError } from "../lib/notifications";

/** Browser-owned fullscreen state also updates when the user presses Escape. */
export function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggle() {
    if (busy) return;
    if (!document.fullscreenEnabled) {
      notifyError("Fullscreen is unavailable in this browser or window.");
      return;
    }
    setBusy(true);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreen(Boolean(document.fullscreenElement));
    } catch {
      notifyError("Unable to change fullscreen. Check your browser permissions and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <IconActionButton
    icon={fullscreen ? Minimize : Maximize}
    label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    aria-pressed={fullscreen}
    aria-busy={busy}
    disabled={busy}
    onClick={() => void toggle()}
  />;
}
