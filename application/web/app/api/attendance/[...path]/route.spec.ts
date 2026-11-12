import { NextRequest } from "next/server";
import { afterEach, describe, it, expect, vi } from "vitest";
import { POST } from "./route";
describe("attendance upload and export proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("preserves multipart binary data and the authenticated cookie", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const call = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", call);
    const bytes = Uint8Array.from([80, 75, 3, 4, 0, 255, 128, 0, 13, 10]);
    const response = await POST(
      new NextRequest("http://localhost:3001/api/attendance/dtr/preview", {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=test",
          cookie: "mspaces_session=test",
        },
        body: bytes,
      }),
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(call.mock.calls[0][1].body)).toEqual(bytes);
    expect(call.mock.calls[0][1].headers.Cookie).toBe("mspaces_session=test");
  });
  it("preserves XLSX export download metadata and bytes", async () => {
    const bytes = Uint8Array.from([80, 75, 3, 4, 255, 0]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="Makati_DTR.xlsx"',
            "Cache-Control": "no-store",
          },
        }),
      ),
    );
    const response = await POST(
      new NextRequest("http://localhost:3001/api/attendance/dtr/export", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("Content-Disposition")).toContain(
      "Makati_DTR.xlsx",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects oversized requests before forwarding", async () => {
    const call = vi.fn();
    vi.stubGlobal("fetch", call);
    const response = await POST(
      new NextRequest("http://localhost:3001/api/attendance/dtr/preview", {
        method: "POST",
        body: new Uint8Array(9 * 1024 * 1024 + 1),
      }),
    );
    expect(response.status).toBe(413);
    expect(call).not.toHaveBeenCalled();
  });
});
