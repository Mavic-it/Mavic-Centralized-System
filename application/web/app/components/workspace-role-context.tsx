"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceRole } from "../data/people";

const WorkspaceRoleContext = createContext<WorkspaceRole | null>(null);

export function WorkspaceRoleProvider({
  role,
  children,
}: {
  role: WorkspaceRole;
  children: ReactNode;
}) {
  return (
    <WorkspaceRoleContext.Provider value={role}>
      {children}
    </WorkspaceRoleContext.Provider>
  );
}

export function useWorkspaceRole(): WorkspaceRole | null {
  return useContext(WorkspaceRoleContext);
}
