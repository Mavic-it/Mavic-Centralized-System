import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

async function proxy(request: NextRequest): Promise<Response> {
  const configuredApiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  const target = new URL(
    `/employees${request.nextUrl.pathname.replace(/^\/api\/employees/, "")}`,
    configuredApiUrl,
  );
  target.search = request.nextUrl.search;
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
      signal: AbortSignal.timeout(10_000),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json(
      { message: "Employee service is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
