import { describe, expect, it } from "vitest";
import { forwardApiResponse } from "./proxy-response";

describe("API response proxy", () => {
  it("preserves private file-view headers and binary response content", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    const upstream = new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename*=UTF-8''id.pdf",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });

    const response = forwardApiResponse(upstream);

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
