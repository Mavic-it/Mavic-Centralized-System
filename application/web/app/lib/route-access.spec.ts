import { describe, expect, it } from "vitest";
import {
  buildLoginRedirectUrl,
  isPublicRoute,
  isSafeReturnUrl,
} from "./route-access";

describe("route-access", () => {
  it("treats login and password-reset flows as public", () => {
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/forgot-password")).toBe(true);
    expect(isPublicRoute("/employees")).toBe(false);
  });

  it("rejects unsafe return URLs but accepts internal relative paths", () => {
    expect(isSafeReturnUrl("/employees/123")).toBe("/employees/123");
    expect(isSafeReturnUrl("/system/users?tab=users")).toBe(
      "/system/users?tab=users",
    );
    expect(isSafeReturnUrl("https://evil.test/")).toBeNull();
    expect(isSafeReturnUrl("//evil.test")).toBeNull();
  });

  it("builds a login redirect URL with a verified return target", () => {
    expect(buildLoginRedirectUrl("/employees/123")).toBe(
      "/login?returnUrl=%2Femployees%2F123",
    );
    expect(buildLoginRedirectUrl("https://evil.test/")).toBe("/login");
  });
});
