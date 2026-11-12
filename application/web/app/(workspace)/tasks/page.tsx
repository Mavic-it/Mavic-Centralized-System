import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import WorkWorkspace from "../../work/workspace";
export default function TasksPage() {
  return (
    <AuthorizedWorkspacePage access="tasks" returnPath="/tasks">
      <WorkWorkspace kind="tasks" />
    </AuthorizedWorkspacePage>
  );
}
