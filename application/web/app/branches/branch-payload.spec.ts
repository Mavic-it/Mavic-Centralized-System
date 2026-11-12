import { describe, expect, it } from "vitest";
import { buildBranchPayload, type BranchFormValues } from "./branch-payload";

const formValues: BranchFormValues = {
  code: " makati ",
  name: "Mspaces Makati",
  description: "Makati branch",
  address: "Rufino",
  city: "Makati",
  province: "Metro Manila",
  postalCode: "2966",
  phone: "09605597803",
  email: "makati@mspaces.com",
  managerUserId: "",
  managerName: "Sir Jovie",
  latitude: 14.5547,
  longitude: 121.0244,
};

describe("buildBranchPayload", () => {
  it("omits the immutable branch code when editing", () => {
    const payload = buildBranchPayload(formValues, true);

    expect(payload).not.toHaveProperty("code");
    expect(payload).toMatchObject({
      name: "Mspaces Makati",
      city: "Makati",
      latitude: 14.5547,
      longitude: 121.0244,
    });
  });

  it("normalizes and includes the branch code when creating", () => {
    expect(buildBranchPayload(formValues, false)).toMatchObject({
      code: "MAKATI",
      name: "Mspaces Makati",
      latitude: 14.5547,
      longitude: 121.0244,
    });
  });
});
