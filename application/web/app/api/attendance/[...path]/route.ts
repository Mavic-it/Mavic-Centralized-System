import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";

async function boundedBody(
  request: NextRequest,
): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD" || !request.body)
    return undefined;
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [],
    limit = 9 * 1024 * 1024;
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RangeError("Upload exceeds 9 MB request limit.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

async function proxy(request: NextRequest): Promise<Response> {
  const configuredApiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  let target: URL;
  try {
    target = new URL(
      `/attendance${request.nextUrl.pathname.replace(/^\/api\/attendance/, "")}`,
      configuredApiUrl,
    );
    target.search = request.nextUrl.search;
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Unsupported API protocol");
    }
  } catch {
    return Response.json(
      { message: "Attendance service is unavailable." },
      { status: 503 },
    );
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body = await boundedBody(request);
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        ...(contentType ? { "Content-Type": contentType } : {}),
        ...(request.headers.get("cookie")
          ? { Cookie: request.headers.get("cookie")! }
          : {}),
      },
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    return forwardApiResponse(upstream);
  } catch (error) {
    if (error instanceof RangeError)
      return Response.json({ message: error.message }, { status: 413 });
    return Response.json(
      { message: "Attendance service is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
