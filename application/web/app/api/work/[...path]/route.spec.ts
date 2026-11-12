import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
describe("private work API proxy", () => {
  it("forwards an optional file with create fields and the multipart boundary intact", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ id: "saved" }));
    vi.stubGlobal("fetch", upstream);
    const form = new FormData();
    form.set("title", "New report");
    form.set("submissionKey", "client-key");
    form.set(
      "file",
      new File(["%PDF-fixture"], "proof.pdf", { type: "application/pdf" }),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/work/incidents/report", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: form,
      }),
      { params: Promise.resolve({ path: ["incidents", "report"] }) },
    );
    expect(response.status).toBe(200);
    const options = upstream.mock.calls[0][1];
    const forwarded = await new Response(options.body, {
      headers: options.headers,
    }).formData();
    expect(forwarded.get("title")).toBe("New report");
    const file = forwarded.get("file") as File;
    expect(file.name).toBe("proof.pdf");
    expect(await file.text()).toBe("%PDF-fixture");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("forwards authenticated reads and preserves private download headers", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response("%PDF-fixture", {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="evidence.pdf"',
          "x-content-type-options": "nosniff",
        },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/work/incidents/id/attachments/file",
        { headers: { cookie: "mspaces_session=test" } },
      ),
      {
        params: Promise.resolve({
          path: ["incidents", "id", "attachments", "file"],
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "evidence.pdf",
    );
    expect(new Headers(upstream.mock.calls[0][1].headers).get("cookie")).toBe(
      "mspaces_session=test",
    );
  });
  it("forwards a same-origin task delete with the session cookie", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(Response.json({ deleted: true }));
    vi.stubGlobal("fetch", upstream);
    const response = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/work/tasks/32c7dd94-e673-4ef9-81b6-aed76095bf30",
        {
          method: "DELETE",
          headers: {
            origin: "http://localhost:3000",
            cookie: "mspaces_session=test",
          },
        },
      ),
      {
        params: Promise.resolve({
          path: ["tasks", "32c7dd94-e673-4ef9-81b6-aed76095bf30"],
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0][1].method).toBe("DELETE");
    expect(new Headers(upstream.mock.calls[0][1].headers).get("cookie")).toBe(
      "mspaces_session=test",
    );
  });
  it("blocks foreign and missing origins before forwarding mutations", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const origin of ["http://untrusted.invalid", ""]) {
      const response = await POST(
        new NextRequest("http://localhost:3000/api/work/tasks/task", {
          method: "POST",
          headers: { origin },
          body: "{}",
        }),
        { params: Promise.resolve({ path: ["tasks", "task"] }) },
      );
      expect(response.status).toBe(403);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts the public same-origin behind a reverse proxy", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ id: "saved" }));
    vi.stubGlobal("fetch", upstream);
    const response = await POST(
      new NextRequest("http://web-internal:3000/api/work/tasks/task", {
        method: "POST",
        headers: {
          origin: "https://hris.example.test",
          host: "web-internal:3000",
          "x-forwarded-host": "hris.example.test",
          "x-forwarded-proto": "https",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ path: ["tasks", "task"] }) },
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("rejects path traversal and oversized bodies", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await GET(new NextRequest("http://localhost/api/work/tasks"), {
          params: Promise.resolve({ path: ["tasks", ".."] }),
        })
      ).status,
    ).toBe(404);
    const response = await POST(
      new NextRequest("http://localhost/api/work/tasks/task", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: "x".repeat(6 * 1024 * 1024 + 1),
      }),
      { params: Promise.resolve({ path: ["tasks", "task"] }) },
    );
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards same-origin actions and masks upstream failures", async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ id: "saved" }));
    vi.stubGlobal("fetch", upstream);
    const make = () =>
      new NextRequest("http://localhost/api/work/tasks/task", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: '{"title":"Task"}',
      });
    expect(
      (
        await POST(make(), {
          params: Promise.resolve({ path: ["tasks", "task"] }),
        })
      ).status,
    ).toBe(200);
    upstream.mockRejectedValue(new Error("private database details"));
    const response = await POST(make(), {
      params: Promise.resolve({ path: ["tasks", "task"] }),
    });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "database details",
    );
  });
});
