import type { LoginCredentials } from "./login-schema";
import type { WorkspaceRole } from "../../app/data/people";
import { isWorkspaceRole } from "../../app/lib/workspace-access";

type AuthErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class AuthClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AuthClientError";
  }
}

export async function login(
  credentials: LoginCredentials,
): Promise<{ role: WorkspaceRole; mustChangePassword: boolean }> {
  let response: Response;

  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new AuthClientError(
      "Sign-in is temporarily unavailable. Please try again.",
      "network_error",
    );
  }

  if (!response.ok) {
    let payload: AuthErrorPayload = {};
    try {
      payload = (await response.json()) as AuthErrorPayload;
    } catch {
      // Use a generic message when the response is not valid JSON.
    }

    throw new AuthClientError(
      payload.error?.message ?? "We couldn't sign you in. Please try again.",
      payload.error?.code ?? "sign_in_failed",
    );
  }

  let session: { role?: unknown; mustChangePassword?: unknown };
  try {
    const sessionResponse = await fetch("/api/auth/me", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!sessionResponse.ok) throw new Error("Session verification failed");
    session = (await sessionResponse.json()) as { role?: unknown };
  } catch {
    throw new AuthClientError(
      "Sign-in succeeded, but workspace access could not be verified. Please try again.",
      "session_verification_failed",
    );
  }

  if (!isWorkspaceRole(session.role)) {
    throw new AuthClientError(
      "Your account does not have a recognized workspace role.",
      "invalid_workspace_role",
    );
  }

  return { role: session.role, mustChangePassword: session.mustChangePassword === true };
}
