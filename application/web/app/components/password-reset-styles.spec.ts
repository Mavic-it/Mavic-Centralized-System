import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("password reset stylesheet activation", () => {
  it("loads shared queue CSS in the persistent root above session and loading boundaries", () => {
    const root = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");
    expect(root).toMatch(
      /^import ["']\.\/components\/password-reset-queue\.module\.css["'];/m,
    );
    const workspace = readFileSync(new URL("./workspace-app-shell.tsx", import.meta.url), "utf8");
    expect(workspace).toContain("await getWorkspaceSession()");
  });
});
