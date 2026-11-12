"use client";

import { useEffect } from "react";
import { watchWorkspaceSession } from "../lib/watch-workspace-session";

export function WorkspaceSessionMonitor() {
  useEffect(() => watchWorkspaceSession(), []);
  return null;
}
