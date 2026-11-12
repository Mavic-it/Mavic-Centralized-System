import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import LeaveWorkspace from "../../leave/workspace";
export default function Page() {
  return (
    <AuthorizedWorkspacePage access="my-leave" returnPath="/my-leave">
      <LeaveWorkspace section="mine" />
    </AuthorizedWorkspacePage>
  );
}
