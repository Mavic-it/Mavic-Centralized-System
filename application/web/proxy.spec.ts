import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("protected route proxy", () => {
  it("redirects requests without a session before the page renders", () => {
    const response = proxy(new NextRequest("http://localhost/me?tab=profile"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "http://localhost/login?returnUrl=%2Fme%3Ftab%3Dprofile",
    );
  });

  it("lets requests with a session continue to server-side validation", () => {
    const request = new NextRequest("http://localhost/me", {
      headers: { cookie: "mspaces_session=token" },
    });

    expect(proxy(request)?.status).toBe(200);
  });
});
