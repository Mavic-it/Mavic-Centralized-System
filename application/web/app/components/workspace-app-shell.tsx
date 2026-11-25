import type { ReactNode } from "react";
import AppShell from "./app-shell";
import { getWorkspaceSession } from "../lib/workspace-session";
import { WorkspaceSessionMonitor } from "./workspace-session-monitor";
import { WorkspaceRealtimeMonitor } from "./workspace-realtime-monitor";
import { AppearanceProvider } from "../appearance/appearance-provider";
import { getServerAppearance } from "../appearance/appearance-server";

export default async function WorkspaceAppShell({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getWorkspaceSession();

  if (session.status !== "authenticated") return children;

  const initialPreferences = await getServerAppearance();
  return <AppearanceProvider key={session.userId} userId={session.userId} initialPreferences={initialPreferences}><AppShell role={session.role}><WorkspaceSessionMonitor /><WorkspaceRealtimeMonitor />{children}</AppShell></AppearanceProvider>;
}
