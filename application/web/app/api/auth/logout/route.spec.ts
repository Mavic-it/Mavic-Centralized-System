import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("auth logout route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the session cookie and relays the cleared cookie", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "mspaces_session=; Path=/; HttpOnly; SameSite=Lax",
        },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await POST(
      new NextRequest("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: { cookie: "mspaces_session=session-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0][0])).toBe(
      "http://localhost:4000/auth/logout",
    );
    expect(upstreamFetch.mock.calls[0][1].headers.cookie).toBe(
      "mspaces_session=session-token",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "mspaces_session=; Path=/; HttpOnly; SameSite=Lax",
    );
  });

  it("returns a safe unavailable response when the auth API cannot be reached", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await POST(
      new NextRequest("http://localhost:3001/api/auth/logout", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "auth_unavailable",
        message: "Sign-out is temporarily unavailable. Please try again.",
      },
    });
  });
});
