import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import LeaveWorkspace from "../../../leave/workspace";
export default function Page() {
  return (
    <AuthorizedWorkspacePage
      access="leave-settings"
      returnPath="/leave/settings"
    >
      <LeaveWorkspace section="settings" />
    </AuthorizedWorkspacePage>
  );
}
