import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileCard = readFileSync(
  new URL("./employee-hr-profile-card.tsx", import.meta.url),
  "utf8",
);

describe("employee HR profile cache", () => {
  it("shows the saved profile from the mutation response immediately", () => {
    expect(profileCard).toMatch(
      /queryClient\.setQueryData\(\s*\["employee-hr-profile", employeeId\],\s*updatedProfile,?\s*\)/,
    );
  });
});
