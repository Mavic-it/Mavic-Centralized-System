import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Authenticated realtime streaming proxy", () => {
  it("streams without buffering and forwards cookies without exposing tokens in URLs", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response('event: refresh\ndata: {"refresh":true}\n\n'),
      );
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(
      new NextRequest("http://localhost/api/realtime/events", {
        headers: { cookie: "mspaces_session=fixture" },
      }),
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(fetcher.mock.calls[0][1].headers.Cookie).toBe(
      "mspaces_session=fixture",
    );
    expect(fetcher.mock.calls[0][0].search).toBe("");
    expect(await response.text()).toContain("event: refresh");
  });
  it.each([401, 403, 429, 503])(
    "preserves upstream status %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("unavailable", { status })),
      );
      const response = await GET(
        new NextRequest("http://localhost/api/realtime/events"),
      );
      expect(response.status).toBe(status);
    },
  );
  it("aborts upstream when the browser cancels the stream", async () => {
    const cancelled = vi.fn();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_target, init) => {
        signal = init.signal;
        return Promise.resolve(
          new Response(new ReadableStream({ cancel: cancelled })),
        );
      }),
    );
    const response = await GET(
      new NextRequest("http://localhost/api/realtime/events"),
    );
    await response.body!.cancel();
    expect(signal?.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalled();
  });
  it("closes a stream cleanly when the upstream connection resets", async () => {
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(output) {
        output.enqueue(encoder.encode("event: ping\ndata: {}\n\n"));
        output.error(new Error("read ECONNRESET"));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(upstream)));
    const response = await GET(
      new NextRequest("http://localhost/api/realtime/events"),
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
  });
  it("handles upstream errors without returning connection details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private upstream details")),
    );
    const response = await GET(
      new NextRequest("http://localhost/api/realtime/events"),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
});
