import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ChangePasswordForm from "./security-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("Account Security form", () => {
  it("shows the password policy and labeled, required fields before entry", () => {
    const html = renderToStaticMarkup(<ChangePasswordForm />);
    expect(html).toContain("12 to 128 characters");
    expect(html).toContain("Uppercase and lowercase letters");
    expect(html).toContain("At least one number");
    expect(html).toContain("At least one symbol");
    for (const id of ["current-password", "new-password", "confirm-password"]) {
      const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
      expect(input).toContain('required=""');
      expect(html).toContain(`for="${id}"`);
    }
    expect(html).toContain('aria-label="Show new password"');
    expect(html).toContain("Start typing to check");
  });
});
