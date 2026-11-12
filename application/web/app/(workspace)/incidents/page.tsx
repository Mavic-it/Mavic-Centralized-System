import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import WorkWorkspace from "../../work/workspace";
export default function IncidentsPage() {
  return (
    <AuthorizedWorkspacePage access="incidents" returnPath="/incidents">
      <WorkWorkspace kind="incidents" />
    </AuthorizedWorkspacePage>
  );
}
