import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import LeaveWorkspace from "../../../leave/workspace";
export default function Page() {
  return (
    <AuthorizedWorkspacePage
      access="leave-management"
      returnPath="/leave/balances"
    >
      <LeaveWorkspace section="balances" />
    </AuthorizedWorkspacePage>
  );
}
