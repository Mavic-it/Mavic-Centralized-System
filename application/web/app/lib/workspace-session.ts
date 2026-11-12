import { cache } from "react";
import { cookies } from "next/headers";
import type { WorkspaceRole } from "../data/people";
import { isWorkspaceRole } from "./workspace-access";

type SessionPayload = {
  userId?: unknown;
  email?: unknown;
  role?: unknown;
  mustChangePassword?: unknown;
  deniedPermissionKeys?: unknown;
  grantedPermissionKeys?: unknown;
};

export type WorkspaceSessionResult =
  | { status: "authenticated"; userId: string; email: string; role: WorkspaceRole; mustChangePassword: boolean; deniedPermissionKeys: string[]; grantedPermissionKeys: string[] }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export const getWorkspaceSession = cache(
  async (): Promise<WorkspaceSessionResult> => {
    const token = (await cookies()).get("mspaces_session")?.value;
    if (!token) return { status: "unauthenticated" };

    let response: Response;
    try {
      const sessionUrl = new URL(
        "/auth/me",
        process.env.AUTH_API_URL ?? "http://localhost:4000",
      );
      if (sessionUrl.protocol !== "http:" && sessionUrl.protocol !== "https:") {
        throw new Error("Unsupported auth API protocol");
      }

      response = await fetch(sessionUrl, {
        headers: { Cookie: `mspaces_session=${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { status: "unavailable" };
    }

    if (response.status === 401) return { status: "unauthenticated" };
    if (!response.ok) return { status: "unavailable" };

    let session: SessionPayload;
    try {
      session = (await response.json()) as SessionPayload;
    } catch {
      return { status: "unavailable" };
    }

    if (
      typeof session.userId !== "string" ||
      typeof session.email !== "string" ||
      !isWorkspaceRole(session.role)
    ) {
      return { status: "unavailable" };
    }

    return {
      status: "authenticated",
      userId: session.userId,
      email: session.email,
      role: session.role,
      mustChangePassword: session.mustChangePassword === true,
      deniedPermissionKeys: Array.isArray(session.deniedPermissionKeys) ? session.deniedPermissionKeys.filter((key): key is string => typeof key === "string") : [],
      grantedPermissionKeys: Array.isArray(session.grantedPermissionKeys) ? session.grantedPermissionKeys.filter((key): key is string => typeof key === "string") : [],
    };
  },
);
