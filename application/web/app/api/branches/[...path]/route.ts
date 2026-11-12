import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

const UPSTREAM_TIMEOUT_MS = 10_000;

async function proxy(request: NextRequest): Promise<Response> {
  const configuredApiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  let target: URL;
  try {
    target = new URL(
      `/branches${request.nextUrl.pathname.replace(/^\/api\/branches/, "")}`,
      configuredApiUrl,
    );
    target.search = request.nextUrl.search;
    if (target.protocol !== "http:" && target.protocol !== "https:")
      throw new Error();
  } catch {
    return Response.json(
      { message: "Branch service is unavailable." },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        ...(request.headers.get("content-type")
          ? { "Content-Type": request.headers.get("content-type")! }
          : {}),
        ...(request.headers.get("cookie")
          ? { Cookie: request.headers.get("cookie")! }
          : {}),
      },
      ...(request.method === "GET" || request.method === "HEAD"
        ? {}
        : { body: await request.text() }),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json(
      { message: "Branch service is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
