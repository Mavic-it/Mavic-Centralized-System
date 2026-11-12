import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import BranchesWorkspace from "../../branches/workspace";

export default function BranchesPage() {
  return (
    <AuthorizedWorkspacePage access="branches" returnPath="/branches">
      <BranchesWorkspace />
    </AuthorizedWorkspacePage>
  );
}
