import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("auth session route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the HttpOnly session cookie to the API and returns its role", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi.fn().mockResolvedValue(
      Response.json({
        userId: "user-1",
        email: "manager@mspaces.test",
        role: "BRANCH_MANAGER",
        branchId: "branch-1",
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await GET(
      new NextRequest("http://localhost:3001/api/auth/me", {
        headers: { cookie: "mspaces_session=session-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch.mock.calls[0][1].headers.Cookie).toBe(
      "mspaces_session=session-token",
    );
    await expect(response.json()).resolves.toMatchObject({
      role: "BRANCH_MANAGER",
      branchId: "branch-1",
    });
  });

  it("preserves an unauthorized response for expired sessions", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: "Authentication required" },
            { status: 401 },
          ),
        ),
    );

    const response = await GET(
      new NextRequest("http://localhost:3001/api/auth/me"),
    );

    expect(response.status).toBe(401);
  });
});
