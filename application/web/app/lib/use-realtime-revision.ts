"use client";
import { useEffect, useState } from "react";
import { workspaceRealtime } from "./workspace-realtime";

/** For a future module's existing effect-based loader; query modules use RealtimeQueryProvider. */
export function useRealtimeRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(
    () => workspaceRealtime.subscribe(() => setRevision((value) => value + 1)),
    [],
  );
  return revision;
}
