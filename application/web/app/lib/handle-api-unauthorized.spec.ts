import { describe, expect, it, vi } from "vitest";
import { handleApiUnauthorized } from "./handle-api-unauthorized";

describe("handleApiUnauthorized", () => {
  it("redirects an expired protected-page session to login with a safe return URL", () => {
    const replace = vi.fn();

    handleApiUnauthorized(403, {
      pathname: "/system/users",
      search: "",
      replace,
    });
    handleApiUnauthorized(401, { pathname: "/login", search: "", replace });
    handleApiUnauthorized(401, {
      pathname: "/system/users",
      search: "?tab=users",
      replace,
    });
    handleApiUnauthorized(401, { pathname: "/employees", search: "", replace });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      "/login?returnUrl=%2Fsystem%2Fusers%3Ftab%3Dusers",
    );
  });
});
