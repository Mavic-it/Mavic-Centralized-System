import type { ReactNode } from "react";
import AppShell from "./app-shell";
import { getWorkspaceSession } from "../lib/workspace-session";
import { WorkspaceSessionMonitor } from "./workspace-session-monitor";
import { WorkspaceRealtimeMonitor } from "./workspace-realtime-monitor";

export default async function WorkspaceAppShell({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getWorkspaceSession();

  if (session.status !== "authenticated") return children;

  return <AppShell role={session.role}><WorkspaceSessionMonitor /><WorkspaceRealtimeMonitor />{children}</AppShell>;
}
