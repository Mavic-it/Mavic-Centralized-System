"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { workspaceRealtime } from "../lib/workspace-realtime";

export function WorkspaceRealtimeMonitor() {
  const router = useRouter();
  useEffect(
    () => workspaceRealtime.subscribe(() => router.refresh()),
    [router],
  );
  return null;
}
