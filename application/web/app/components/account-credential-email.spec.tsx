import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AccountCredentialNotice,
  AccountCredentialStatus,
  CredentialRegenerationDialog,
} from "./account-credential-email";
import type { WorkspaceAccount } from "../data/people";

const account: WorkspaceAccount = {
  id: "account-1",
  name: "Person",
  email: "person@example.test",
  role: "EMPLOYEE",
  status: "ACTIVE",
  branch: "Main",
  mfa: "NOT_CONFIGURED",
  activeSessions: 0,
  lastSignIn: "Unknown",
  mustChangePassword: true,
  credentialEmailStatus: "FAILED",
};

describe("Account credential email interface", () => {
  it("explains automatic delivery without exposing a password control", () => {
    const html = renderToStaticMarkup(<AccountCredentialNotice />);
    expect(html).toContain("generated automatically");
    expect(html).not.toContain("<input");
  });
  it("distinguishes failed, pending and accepted delivery without claiming inbox delivery", () => {
    const failure = renderToStaticMarkup(
      <AccountCredentialStatus account={account} />,
    );
    expect(failure).toContain("Credential email failed");
    expect(failure).toContain("Password change required");
    expect(
      renderToStaticMarkup(
        <AccountCredentialStatus
          account={{
            ...account,
            credentialEmailStatus: "ACCEPTED_BY_PROVIDER",
          }}
        />,
      ),
    ).toContain("Credential email accepted");
    expect(
      renderToStaticMarkup(
        <AccountCredentialStatus
          account={{ ...account, credentialEmailStatus: "PROCESSING" }}
        />,
      ),
    ).toContain("processing");
    expect(
      renderToStaticMarkup(
        <AccountCredentialStatus
          account={{ ...account, credentialEmailStatus: "NOT_REQUIRED" }}
        />,
      ),
    ).toBe("");
  });
  it("provides a pending-safe confirmation and accessible retry error", () => {
    const html = renderToStaticMarkup(
      <CredentialRegenerationDialog
        account={account}
        pending
        error="Delivery failed"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(html).toContain("person@example.test");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).not.toContain('type="password"');
    expect(html).toContain("previous temporary password will stop working");
  });
});
