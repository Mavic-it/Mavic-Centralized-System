import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

async function proxy(request: NextRequest): Promise<Response> {
  const apiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  const target = new URL(
    `/notifications${request.nextUrl.pathname.replace(/^\/api\/notifications/, "")}`,
    apiUrl,
  );
  target.search = request.nextUrl.search;
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        ...(request.headers.get("cookie")
          ? { Cookie: request.headers.get("cookie")! }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json(
      { message: "Notification service is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;

export const DELETE = proxy;
