import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import PasswordResetQueue from "../../../components/password-reset-queue";

export default function PasswordResetRequestsPage() {
  return (
    <AuthorizedWorkspacePage
      access="users"
      roles={["SUPER_ADMIN", "IT_ADMIN", "HR_ADMIN", "BRANCH_MANAGER"]}
      returnPath="/system/password-reset-requests"
    >
      <PasswordResetQueue />
    </AuthorizedWorkspacePage>
  );
}
