import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("reservation same-origin proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("forwards scoped reads without caching", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetch);
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/reservations/calendar?branchId=a",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(String(fetch.mock.calls[0][0])).toBe(
      "http://localhost:4000/reservations/calendar?branchId=a",
    );
  });
  it("blocks foreign origins before forwarding writes", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      new NextRequest("http://localhost:3000/api/reservations", {
        method: "POST",
        headers: { origin: "https://other.invalid" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts a public origin behind a reverse proxy", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "saved" }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      new NextRequest("http://web-internal:3000/api/reservations", {
        method: "POST",
        headers: {
          origin: "https://hris.example.test",
          host: "web-internal:3000",
          "x-forwarded-host": "hris.example.test",
          "x-forwarded-proto": "https",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
  });
});
