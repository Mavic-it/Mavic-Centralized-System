import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("user API proxy authentication response", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards the expired session cookie for the browser to clear", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Authentication required" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie":
            "mspaces_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
        },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await GET(
      new NextRequest("http://localhost:3001/api/users", {
        headers: { cookie: "mspaces_session=expired-session" },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toContain(
      "mspaces_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    );
    expect(upstreamFetch.mock.calls[0][1].headers.Cookie).toBe(
      "mspaces_session=expired-session",
    );
  });

  it("preserves binary upload bytes when proxying profile pictures", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", upstreamFetch);
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

    await POST(
      new NextRequest("http://localhost:3001/api/users/me/profile-picture", {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: bytes,
      }),
    );

    const forwardedBody = upstreamFetch.mock.calls[0][1].body as Buffer;
    expect(Buffer.from(forwardedBody)).toEqual(bytes);
  });
});
