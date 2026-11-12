import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldLoadOwnEmployee } from "./own-profile-link";

const employeePortal = readFileSync(
  new URL("../components/people-workspace.tsx", import.meta.url),
  "utf8",
);

describe("own employee loading", () => {
  it("does not request an employee for an unlinked Super Admin", () => {
    expect(shouldLoadOwnEmployee("SUPER_ADMIN", "independent")).toBe(false);
  });

  it("keeps the employee portal available to linked Super Admins", () => {
    expect(shouldLoadOwnEmployee("SUPER_ADMIN", "employee")).toBe(true);
  });

  it("loads employee records for employee roles after role resolution", () => {
    expect(shouldLoadOwnEmployee("STAFF")).toBe(true);
    expect(shouldLoadOwnEmployee(null)).toBe(false);
  });

  it("gates the remaining employee portal query on the profile link", () => {
    expect(employeePortal).toContain("enabled: canLoadOwnEmployee");
    expect(employeePortal).toContain('router.replace("/my-profile")');
  });
});
