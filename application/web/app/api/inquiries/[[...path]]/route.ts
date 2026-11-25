import { NextRequest } from "next/server";
import { forwardApiResponse } from "../../proxy-response";
async function boundedBody(
  request: NextRequest,
): Promise<ArrayBuffer | undefined> {
  if (["GET", "HEAD"].includes(request.method) || !request.body)
    return undefined;
  const limit = 6 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    throw new RangeError("Request too large");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new RangeError("Request too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}
async function proxy(request: NextRequest) {
  try {
    const target = new URL(
      `/inquiries${request.nextUrl.pathname.replace(/^\/api\/inquiries/, "")}`,
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
    if (!["http:", "https:"].includes(target.protocol))
      throw new Error("Invalid API URL");
    target.search = request.nextUrl.search;
    const headers = new Headers();
    for (const name of ["cookie", "content-type", "idempotency-key"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const body = await boundedBody(request);
    return forwardApiResponse(
      await fetch(target, {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(120000),
      }),
    );
  } catch (error) {
    return error instanceof RangeError
      ? Response.json(
          { message: "Inquiry request is too large." },
          { status: 413 },
        )
      : Response.json(
          { message: "Inquiry service is temporarily unavailable." },
          { status: 503 },
        );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
