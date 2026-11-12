import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH, POST } from "./route";

describe("employee API proxy methods", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards employee updates and deletes to the API", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi
      .fn()
      .mockImplementation(async (_target, init) =>
        Response.json({ method: init.method }),
      );
    vi.stubGlobal("fetch", upstreamFetch);

    const patchResponse = await PATCH(
      new NextRequest("http://localhost:3001/api/employees/employee-1", {
        method: "PATCH",
        headers: {
          cookie: "mspaces_session=valid-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({ position: "Manager" }),
      }),
    );
    const deleteResponse = await DELETE(
      new NextRequest("http://localhost:3001/api/employees/employee-1", {
        method: "DELETE",
        headers: { cookie: "mspaces_session=valid-session" },
      }),
    );

    expect(patchResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0][0])).toBe(
      "http://localhost:4000/employees/employee-1",
    );
    expect(upstreamFetch.mock.calls[0][1]).toMatchObject({
      method: "PATCH",
      headers: {
        Cookie: "mspaces_session=valid-session",
        "Content-Type": "application/json",
      },
    });
    expect(Buffer.isBuffer(upstreamFetch.mock.calls[0][1].body)).toBe(true);
    expect(upstreamFetch.mock.calls[0][1].body.toString()).toBe(
      JSON.stringify({ position: "Manager" }),
    );
    expect(upstreamFetch.mock.calls[1][1]).toMatchObject({
      method: "DELETE",
      headers: { Cookie: "mspaces_session=valid-session" },
    });
  });

  it("forwards multipart file uploads as binary without changing the boundary", async () => {
    vi.stubEnv("AUTH_API_URL", "http://localhost:4000");
    const upstreamFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "document-1" }));
    vi.stubGlobal("fetch", upstreamFetch);
    const formData = new FormData();
    formData.set("category", "GOVERNMENT_ID");
    formData.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "id.png", {
        type: "image/png",
      }),
    );

    const response = await POST(
      new NextRequest(
        "http://localhost:3001/api/employees/employee-1/document-records",
        {
          method: "POST",
          headers: { cookie: "mspaces_session=valid-session" },
          body: formData,
        },
      ),
    );

    const [, init] = upstreamFetch.mock.calls[0];
    expect(response.status).toBe(200);
    expect(init.headers["Content-Type"]).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(Buffer.isBuffer(init.body)).toBe(true);
    expect(init.body.toString()).toContain("GOVERNMENT_ID");
    expect(init.body.toString()).toContain("id.png");
  });
});
