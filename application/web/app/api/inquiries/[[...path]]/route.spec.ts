import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
afterEach(() => vi.unstubAllGlobals());
describe("Inquiry API proxy", () => {
  it("forwards authentication and filters and preserves access denial", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "Branch denied" }, { status: 403 }),
      );
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      new NextRequest("http://localhost/api/inquiries?branchId=a", {
        headers: { cookie: "mspaces_session=synthetic" },
      }),
    );
    expect(response.status).toBe(403);
    expect(String(upstream.mock.calls[0][0])).toContain(
      "/inquiries?branchId=a",
    );
    expect(upstream.mock.calls[0][1].headers.get("cookie")).toBe(
      "mspaces_session=synthetic",
    );
  });
  it("rejects oversized upload declarations before forwarding", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await POST(
      new NextRequest("http://localhost/api/inquiries/import/preview", {
        method: "POST",
        body: "test",
        headers: { "content-length": String(7 * 1024 * 1024) },
      }),
    );
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("returns a real unavailable state when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(
      (await GET(new NextRequest("http://localhost/api/inquiries"))).status,
    ).toBe(503);
  });
});
