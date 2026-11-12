import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  // Bound connection setup only, never the lifetime of a healthy stream.
  const timeout = setTimeout(abort, 8000);
  try {
    const target = new URL(
      "/realtime/events",
      process.env.AUTH_API_URL ?? "http://localhost:4000",
    );
    if (!["http:", "https:"].includes(target.protocol))
      throw new Error("Invalid upstream");
    const upstream = await fetch(target, {
      headers: {
        Cookie: request.headers.get("cookie") ?? "",
        Accept: "text/event-stream",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      request.signal.removeEventListener("abort", abort);
      return Response.json(
        { message: "Realtime connection unavailable." },
        { status: upstream.status || 503 },
      );
    }
    const reader = upstream.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            request.signal.removeEventListener("abort", abort);
            output.close();
          } else output.enqueue(chunk.value);
        } catch {
          request.signal.removeEventListener("abort", abort);
          // A long-lived upstream connection can end with ECONNRESET when the
          // API restarts or the network drops. Closing lets EventSource retry
          // without surfacing a response-stream failure in Next.js.
          output.close();
        }
      },
      async cancel() {
        request.signal.removeEventListener("abort", abort);
        controller.abort();
        await reader.cancel().catch(() => undefined);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
    return Response.json(
      { message: "Realtime connection unavailable." },
      { status: 503 },
    );
  }
}
