import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import PeopleWorkspace from "../../../components/people-workspace";

export default function UserAccessPage() {
  return (
    <AuthorizedWorkspacePage access="users" returnPath="/system/users">
      <PeopleWorkspace mode="users" />
    </AuthorizedWorkspacePage>
  );
}
