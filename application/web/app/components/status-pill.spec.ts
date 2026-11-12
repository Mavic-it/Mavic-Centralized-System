import { describe, expect, it } from "vitest";
import { normalizeStatusPillValue } from "./status-pill";

describe("normalizeStatusPillValue", () => {
  it("uses a visible fallback for missing status values", () => {
    expect(normalizeStatusPillValue(undefined)).toBe("unknown");
    expect(normalizeStatusPillValue(null)).toBe("unknown");
  });

  it("normalizes ordinary status labels", () => {
    expect(normalizeStatusPillValue("NOT CONFIGURED")).toBe("not-configured");
  });
});
