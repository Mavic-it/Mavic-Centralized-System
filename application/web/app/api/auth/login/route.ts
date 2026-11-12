import { loginCredentialsSchema } from "@/lib/auth/login-schema";

const MAX_BODY_BYTES = 4096;
const UPSTREAM_TIMEOUT_MS = 8000;

type BodyResult =
  { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

async function readJsonBody(request: Request): Promise<BodyResult> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };

  const decoder = new TextDecoder();
  let body = "";
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        body += decoder.decode();
        break;
      }

      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }

      body += decoder.decode(value, { stream: true });
    }

    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return errorResponse(415, "unsupported_media_type", "Use a JSON request.");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse(
      413,
      "request_too_large",
      "The sign-in request is too large.",
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return errorResponse(
      body.status,
      body.status === 413 ? "request_too_large" : "invalid_request",
      body.status === 413
        ? "The sign-in request is too large."
        : "Enter a valid email and password.",
    );
  }

  const credentials = loginCredentialsSchema.safeParse(body.value);
  if (!credentials.success) {
    return errorResponse(
      400,
      "invalid_credentials_format",
      "Check the email and password fields.",
    );
  }

  const configuredApiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  let loginUrl: URL;
  try {
    loginUrl = new URL("/auth/login", configuredApiUrl);
    if (loginUrl.protocol !== "http:" && loginUrl.protocol !== "https:") {
      throw new Error("Unsupported auth API protocol");
    }
  } catch {
    return errorResponse(
      503,
      "auth_unavailable",
      "Sign-in is not available right now.",
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials.data),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return errorResponse(
      503,
      "auth_unavailable",
      "Sign-in is temporarily unavailable. Please try again.",
    );
  }

  if (!upstream.ok) {
    if (
      upstream.status === 400 ||
      upstream.status === 401 ||
      upstream.status === 403
    ) {
      return errorResponse(
        401,
        "invalid_credentials",
        "Email or password is incorrect.",
      );
    }

    return errorResponse(
      503,
      "auth_unavailable",
      "Sign-in is temporarily unavailable. Please try again.",
    );
  }

  const sessionCookie = upstream.headers.get("set-cookie");
  const cookiePair = sessionCookie?.split(";", 1)[0];
  if (
    !sessionCookie ||
    !cookiePair ||
    !/^mspaces_session=[A-Za-z0-9._~-]+$/.test(cookiePair) ||
    !/;\s*httponly(?:;|$)/i.test(sessionCookie) ||
    !/;\s*samesite=lax(?:;|$)/i.test(sessionCookie)
  ) {
    return errorResponse(
      502,
      "invalid_auth_response",
      "Sign-in could not be completed. Please try again.",
    );
  }

  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    process.env.NODE_ENV === "production" &&
      !/;\s*secure(?:;|$)/i.test(sessionCookie)
      ? `${sessionCookie}; Secure`
      : sessionCookie,
  );

  return Response.json({ ok: true }, { headers });
}
