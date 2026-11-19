import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

async function proxy(request: NextRequest): Promise<Response> {
  let target: URL;
  try {
    target = new URL(
      `/inventory${request.nextUrl.pathname.replace(/^\/api\/inventory/, "")}`,
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
    target.search = request.nextUrl.search;
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Unsupported API protocol");
    }
  } catch {
    return Response.json({ message: "Inventory service is unavailable." }, { status: 503 });
  }

  try {
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    const contentType = request.headers.get("content-type");
    const idempotencyKey = request.headers.get("idempotency-key");
    if (cookie) headers.set("Cookie", cookie);
    if (contentType) headers.set("Content-Type", contentType);
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    const body = request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();
    if (body && body.byteLength > 256 * 1024) {
      return Response.json({ message: "Inventory request is too large." }, { status: 413 });
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return forwardApiResponse(upstream);
  } catch {
    return Response.json({ message: "Inventory service is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
