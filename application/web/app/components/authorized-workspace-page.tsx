import { WorkspaceAccessError } from "./workspace-access-error";
import { redirect } from "next/navigation";
import type { WorkspaceRole } from "../data/people";
import type { ReactNode } from "react";
import { buildLoginRedirectUrl } from "../lib/route-access";
import {
  canAccessWorkspaceArea,
  landingPageForRole,
  permissionKeyForPath,
  type WorkspaceArea,
} from "../lib/workspace-access";
import { getWorkspaceSession } from "../lib/workspace-session";

type AuthorizedWorkspacePageProps = {
  access: WorkspaceArea;
  returnPath: string;
  children: ReactNode;
  roles?: readonly WorkspaceRole[];
};

export default async function AuthorizedWorkspacePage({
  access,
  returnPath,
  children,
  roles,
}: AuthorizedWorkspacePageProps) {
  const session = await getWorkspaceSession();

  if (session.status === "unauthenticated") {
    redirect(buildLoginRedirectUrl(returnPath));
  }

  if (session.status === "unavailable") {
    return <WorkspaceAccessError />;
  }

  if (session.mustChangePassword && returnPath !== "/me/security") {
    redirect("/me/security");
  }

  const permissionKey = permissionKeyForPath(returnPath,access);
  const explicitGrant = Boolean(permissionKey && session.grantedPermissionKeys.includes(permissionKey));
  if ((returnPath === "/" && session.role !== "SUPER_ADMIN" && !explicitGrant) || (!canAccessWorkspaceArea(session.role, access) && !explicitGrant) || (permissionKey && session.deniedPermissionKeys.includes(permissionKey)) || (roles && !roles.includes(session.role))) {
    redirect(landingPageForRole(session.role));
  }

  return children;
}
