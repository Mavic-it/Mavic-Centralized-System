import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import LeaveWorkspace from "../../../leave/workspace";
export default function Page() {
  return (
    <AuthorizedWorkspacePage
      access="leave-management"
      returnPath="/leave/reports"
    >
      <LeaveWorkspace section="reports" />
    </AuthorizedWorkspacePage>
  );
}
