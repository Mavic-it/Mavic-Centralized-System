import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(new URL("./people-workspace.tsx", import.meta.url), "utf8");

describe("account creation option loading", () => {
  it("loads employee and branch choices only while the modal is open", () => {
    expect([...workspace.matchAll(/enabled: isCreateOpen/g)]).toHaveLength(2);
  });

  it("shows request errors and lets users retry each failed lookup in place", () => {
    expect(workspace).toContain("employeesQuery.error.message");
    expect(workspace).toContain("branchesQuery.error.message");
    expect(workspace).toContain("employeesQuery.refetch()");
    expect(workspace).toContain("branchesQuery.refetch()");
  });
});
