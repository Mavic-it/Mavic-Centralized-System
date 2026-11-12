import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

function isSameOriginRequest(request: NextRequest) {
  const header = request.headers.get("origin");
  if (!header) return false;
  const first = (name: string) =>
    request.headers.get(name)?.split(",", 1)[0]?.trim();
  const host =
    first("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const protocol =
    first("x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "");
  try {
    const origin = new URL(header),
      expected = new URL(`${protocol}://${host}`);
    return (
      ["http", "https"].includes(protocol) &&
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash &&
      origin.origin === expected.origin
    );
  } catch {
    return false;
  }
}

async function proxy(request: NextRequest): Promise<Response> {
  const suffix = request.nextUrl.pathname.replace(/^\/api\/reservations/, "");
  if (
    !suffix
      .split("/")
      .filter(Boolean)
      .every((part) => /^[a-zA-Z0-9-]+$/.test(part))
  )
    return Response.json(
      { message: "Unknown reservation endpoint." },
      { status: 404 },
    );
  if (request.method !== "GET" && !isSameOriginRequest(request))
    return Response.json(
      { message: "Same-origin requests are required." },
      { status: 403 },
    );
  const apiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  let target: URL;
  try {
    target = new URL(`/reservations${suffix}`, apiUrl);
    target.search = request.nextUrl.search;
    if (!["http:", "https:"].includes(target.protocol)) throw new Error();
  } catch {
    return Response.json(
      { message: "Reservation service is unavailable." },
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
      signal: AbortSignal.timeout(10000),
    });
    const response = forwardApiResponse(upstream);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return Response.json(
      { message: "Reservation service is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
