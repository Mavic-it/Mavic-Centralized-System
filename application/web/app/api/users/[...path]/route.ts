import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

// Credential email requests wait for bounded SMTP acceptance.
const UPSTREAM_TIMEOUT_MS = 60_000;

async function proxy(request: NextRequest): Promise<Response> {
  const configuredApiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  let target: URL;
  try {
    target = new URL(
      `/users${request.nextUrl.pathname.replace(/^\/api\/users/, "")}`,
      configuredApiUrl,
    );
    target.search = request.nextUrl.search;
    if (target.protocol !== "http:" && target.protocol !== "https:")
      throw new Error();
  } catch {
    return Response.json(
      { message: "User service is unavailable." },
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
        : { body: Buffer.from(await request.arrayBuffer()) }),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json(
      { message: "User service is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
export const POST = proxy;
