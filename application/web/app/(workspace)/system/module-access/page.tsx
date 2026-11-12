import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import ModuleAccessWorkspace from "../../../components/module-access-workspace";

export default function ModuleAccessPage() {
  return (
    <AuthorizedWorkspacePage
      access="users"
      roles={["SUPER_ADMIN", "IT_ADMIN"]}
      returnPath="/system/module-access"
    >
      <ModuleAccessWorkspace />
    </AuthorizedWorkspacePage>
  );
}
