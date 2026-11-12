import { forwardApiResponse } from "../../proxy-response";

const UPSTREAM_TIMEOUT_MS = 8000;

function unavailableResponse(): Response {
  return Response.json(
    {
      error: {
        code: "auth_unavailable",
        message: "Sign-out is temporarily unavailable. Please try again.",
      },
    },
    { status: 503 },
  );
}

export async function POST(request: Request): Promise<Response> {
  let logoutUrl: URL;
  try {
    logoutUrl = new URL(
      "/auth/logout",
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
    if (logoutUrl.protocol !== "http:" && logoutUrl.protocol !== "https:") {
      throw new Error("Unsupported auth API protocol");
    }
  } catch {
    return unavailableResponse();
  }

  let upstream: Response;
  try {
    const cookie = request.headers.get("cookie");
    upstream = await fetch(logoutUrl, {
      method: "POST",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return unavailableResponse();
  }

  return forwardApiResponse(upstream);
}
