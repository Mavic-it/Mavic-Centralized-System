import { describe, expect, it } from "vitest";
import { generateInitialPassword } from "./initial-password";

describe("generateInitialPassword", () => {
  it("creates an 18-character password that meets the account policy", () => {
    const password = generateInitialPassword();

    expect(password).toHaveLength(18);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[!@#$%+_-]/);
    expect(password).toMatch(/^[A-Za-z0-9!@#$%+_-]+$/);
  });
});
