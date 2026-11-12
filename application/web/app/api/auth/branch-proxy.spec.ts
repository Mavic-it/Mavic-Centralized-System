import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyBranchContext } from "./branch-proxy";

describe("branch context proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards an allowed branch change and relays the rotated session cookie", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, branchId: "branch-2" }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie":
            "mspaces_session=new-token; Path=/; HttpOnly; SameSite=Lax",
        },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await proxyBranchContext(
      new NextRequest("http://localhost:3001/api/auth/branch", {
        method: "POST",
        headers: {
          cookie: "mspaces_session=old-token",
          origin: "http://localhost:3001",
          "content-type": "application/json",
        },
        body: JSON.stringify({ branchId: "branch-2", role: "SUPER_ADMIN" }),
      }),
      "branch",
    );

    expect(response.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0][0])).toBe(
      "http://localhost:4000/auth/branch",
    );
    const options = upstreamFetch.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.cache).toBe("no-store");
    expect(new Headers(options.headers).get("cookie")).toBe(
      "mspaces_session=old-token",
    );
    expect(JSON.parse(options.body)).toEqual({ branchId: "branch-2" });
    expect(response.headers.get("set-cookie")).toContain(
      "mspaces_session=new-token",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      branchId: "branch-2",
    });
  });

  it("forwards the session cookie when loading accessible branches", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ branches: [] }));
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await proxyBranchContext(
      new NextRequest("http://localhost:3001/api/auth/branches", {
        headers: { cookie: "mspaces_session=session-token" },
      }),
      "branches",
    );

    expect(response.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0][0])).toBe(
      "http://localhost:4000/auth/branches",
    );
    const options = upstreamFetch.mock.calls[0][1];
    expect(options.method).toBe("GET");
    expect(new Headers(options.headers).get("cookie")).toBe(
      "mspaces_session=session-token",
    );
  });

  it("rejects a branch change from another origin before contacting the API", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await proxyBranchContext(
      new NextRequest("http://localhost:3001/api/auth/branch", {
        method: "POST",
        headers: {
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ branchId: "branch-2" }),
      }),
      "branch",
    );

    expect(response.status).toBe(403);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it.each(["   ", 42, "x".repeat(101)])(
    "rejects an invalid branch ID (%s) before contacting the API",
    async (branchId) => {
      const upstreamFetch = vi.fn();
      vi.stubGlobal("fetch", upstreamFetch);

      const response = await proxyBranchContext(
        new NextRequest("http://localhost:3001/api/auth/branch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ branchId }),
        }),
        "branch",
      );

      expect(response.status).toBe(400);
      expect(upstreamFetch).not.toHaveBeenCalled();
    },
  );

  it("passes through a forbidden response for an unassigned branch", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "Branch access denied." }, { status: 403 }),
        ),
    );

    const response = await proxyBranchContext(
      new NextRequest("http://localhost:3001/api/auth/branch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId: "unassigned-branch" }),
      }),
      "branch",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Branch access denied.",
    });
  });
  it.each([{ branchIds: ["first", "second"] }, { allBranches: true }])(
    "forwards multi-branch selection %j",
    async (selection) => {
      const upstream = vi.fn().mockResolvedValue(Response.json({ ok: true }));
      vi.stubGlobal("fetch", upstream);
      const response = await proxyBranchContext(
        new NextRequest("http://localhost:3000/api/auth/branch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selection),
        }),
        "branch",
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual(selection);
    },
  );
  it.each([
    { branchIds: [] },
    { branchIds: ["first", "first"] },
    { branchIds: ["first", 42] },
  ])("rejects invalid branch selections %j", async (selection) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await proxyBranchContext(
      new NextRequest("http://localhost:3000/api/auth/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      }),
      "branch",
    );
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
