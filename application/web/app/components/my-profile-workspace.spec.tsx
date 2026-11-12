import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import MyProfileWorkspace from "./my-profile-workspace";
import { MyProfileLoading } from "./my-profile-loading";
import { WorkspaceRoleProvider } from "./workspace-role-context";
import { DialogProvider } from "./ui/confirmation-provider";
import type { WorkspaceRole } from "../data/people";
import styles from "./my-profile-workspace.module.css";
import theme from "./ui/workspace-theme.module.css";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const account = {
  email: "test@example.test",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  createdAt: null,
  lastLoginAt: null,
};
const profile = {
  firstName: "Alex",
  middleName: null,
  lastName: "Santos",
  displayName: "Alex Santos",
  dateOfBirth: null,
  gender: null,
  contactNumber: "Test contact",
  homeAddress: "Artificial address only",
  emergencyContactName: null,
  emergencyContactRelationship: null,
  emergencyContactNumber: null,
  profilePictureUpdatedAt: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
function renderProfile(
  data?: unknown,
  role: WorkspaceRole = "SUPER_ADMIN",
  error = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } },
  });
  if (data) client.setQueryData(["my-profile"], data);
  if (error)
    client
      .getQueryCache()
      .build(client, { queryKey: ["my-profile"] })
      .setState({
        status: "error",
        error: new Error("Artificial load error"),
        fetchStatus: "idle",
      });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <WorkspaceRoleProvider role={role}>
        <DialogProvider>
          <MyProfileWorkspace />
        </DialogProvider>
      </WorkspaceRoleProvider>
    </QueryClientProvider>,
  );
}

describe("My Profile presentation", () => {
  it("shows saved personal details and read-only account information", () => {
    const html = renderProfile({ mode: "independent", account, profile });
    expect(html).toContain("Alex Santos");
    expect(html).toContain("Edit profile");
    expect(html).toContain("Super Admin");
    expect(html).toContain("No emergency contact added.");
    expect(html).toContain("Not recorded");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="password"');
    expect(html).toContain('aria-describedby="profile-photo-hint"');
  });
  it("keeps initial setup fields required and photo upload disabled until saved", () => {
    const html = renderProfile({ mode: "independent", account, profile: null });
    expect(html).toContain("Complete Your Profile");
    expect(html).toContain("Save profile");
    expect(html.match(/required=""/g)).toHaveLength(5);
    expect(html).toContain('type="tel"');
    expect(html).toContain('type="date"');
    expect(html).toContain("complete all three fields");
    expect(html).toMatch(
      /aria-label="Save your profile before adding a picture"[^>]*disabled=""/,
    );
    expect(html).not.toContain('name="role"');
    expect(html).not.toContain('type="email"');
  });
  it("does not display independent profile data for employee-linked or unauthorized roles", () => {
    const linked = renderProfile({ mode: "employee", employeeId: "test-only" });
    expect(linked).toContain("Opening your linked employee profile");
    expect(linked).not.toContain("<form");
    const restricted = renderProfile(
      { mode: "independent", account, profile },
      "EMPLOYEE",
    );
    expect(restricted).not.toContain("Alex Santos");
    expect(restricted).not.toContain("test@example.test");
    expect(restricted).toContain("Loading your profile");
  });
  it("uses the same structural skeleton for query loading and route loading", () => {
    expect(renderProfile()).toBe(renderToStaticMarkup(<MyProfileLoading />));
    const html = renderProfile();
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<form");
  });
  it("offers error recovery without rendering empty personal data", () => {
    const html = renderProfile(undefined, "SUPER_ADMIN", true);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Artificial load error");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Complete Your Profile");
  });
  it("escapes personal values and uses only the own-photo endpoint", () => {
    const html = renderProfile({
      mode: "independent",
      account,
      profile: {
        ...profile,
        displayName: "<script>test</script>",
        profilePictureUpdatedAt: "test&version",
      },
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("/api/users/me/profile-picture?v=test%26version");
    expect(html).not.toContain("employeeId=");
  });
  it("renders isolated actual-component fixtures for responsive review", () => {
    if (process.env.PROFILE_VISUAL_FIXTURE !== "true") return;
    const states = {
      saved: renderProfile({ mode: "independent", account, profile }),
      setup: renderProfile({ mode: "independent", account, profile: null }),
      loading: renderProfile(),
      error: renderProfile(undefined, "SUPER_ADMIN", true),
    };
    const css = (path: string, mapping: Record<string, string>) =>
      readFileSync(resolve(path), "utf8").replace(
        /\.([a-zA-Z_][\w-]*)/g,
        (match, key: string) => (mapping[key] ? `.${mapping[key]}` : match),
      );
    const sheet =
      readFileSync(resolve("app/globals.css"), "utf8").replace(
        /^@import.*$/gm,
        "",
      ) +
      css("app/components/ui/workspace-theme.module.css", theme) +
      css("app/components/my-profile-workspace.module.css", styles);
    const root = resolve("../../tmp/my-profile-visual");
    mkdirSync(root, { recursive: true });
    for (const [state, html] of Object.entries(states))
      writeFileSync(
        resolve(root, `${state}.html`),
        `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheet}*{box-sizing:border-box}body{margin:0;padding:24px;background:#f5f7f9;font-family:Arial,sans-serif}button,input,textarea{font-family:inherit}</style></head><body>${html}</body></html>`,
      );
    expect(states.saved).toContain("Alex Santos");
  });
});
