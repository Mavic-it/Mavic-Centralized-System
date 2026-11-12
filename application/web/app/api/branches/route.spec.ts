import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("branch API root route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards /api/branches to the API root with its query string", async () => {
    vi.stubEnv("AUTH_API_URL", undefined);
    const upstreamFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true, data: [] }));
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await GET(
      new NextRequest("http://localhost:3001/api/branches?status=ACTIVE"),
    );

    expect(response.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0][0])).toBe(
      "http://localhost:4000/branches?status=ACTIVE",
    );
  });
});
