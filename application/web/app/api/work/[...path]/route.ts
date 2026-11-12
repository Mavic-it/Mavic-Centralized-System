import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

function isSameOriginRequest(request: NextRequest) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  // Next may construct nextUrl from the internal proxy URL. Use the original
  // host/protocol supplied by the reverse proxy when available, and raw Host
  // for direct requests.
  const firstHeaderValue = (name: string) =>
    request.headers.get(name)?.split(",", 1)[0]?.trim();
  const host =
    firstHeaderValue("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const protocol =
    firstHeaderValue("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(/:$/, "");

  try {
    const origin = new URL(originHeader);
    const expected = new URL(`${protocol}://${host}`);
    return (
      (protocol === "http" || protocol === "https") &&
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

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const [kind, ...segments] = path;
  if (
    !["tasks", "incidents"].includes(kind) ||
    segments.some((s) => !/^[a-zA-Z0-9-]+$/.test(s))
  )
    return Response.json(
      { message: "Unknown work endpoint." },
      { status: 404 },
    );
  if (request.method !== "GET" && !isSameOriginRequest(request))
    return Response.json(
      { message: "Same-origin requests are required." },
      { status: 403 },
    );
  const headers = new Headers();
  for (const name of ["cookie", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: ArrayBuffer | undefined;
  try {
    if (request.body) {
      const reader = request.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 6 * 1024 * 1024) {
          await reader.cancel();
          return Response.json(
            { message: "Upload exceeds 6 MB request limit." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      body = bytes.buffer;
    }
    const target = new URL(
      `/work/${[kind, ...segments].join("/")}`,
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
    target.search = request.nextUrl.search;
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const result = forwardApiResponse(upstream);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  } catch {
    return Response.json(
      { message: "Work service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
