import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

const UPSTREAM_TIMEOUT_MS = 8000;

export async function GET(request: NextRequest): Promise<Response> {
  let sessionUrl: URL;
  try {
    sessionUrl = new URL(
      "/auth/me",
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
    if (sessionUrl.protocol !== "http:" && sessionUrl.protocol !== "https:") {
      throw new Error("Unsupported auth API protocol");
    }
  } catch {
    return Response.json(
      { message: "Workspace access could not be verified." },
      { status: 503 },
    );
  }

  try {
    const cookie = request.headers.get("cookie");
    const upstream = await fetch(sessionUrl, {
      headers: cookie ? { Cookie: cookie } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json(
      { message: "Workspace access could not be verified." },
      { status: 503 },
    );
  }
}
