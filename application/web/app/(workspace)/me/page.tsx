import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import PeopleWorkspace from "../../components/people-workspace";

export default function EmployeePortalPage() {
  return (
    <AuthorizedWorkspacePage access="portal" returnPath="/me">
      <PeopleWorkspace mode="me" />
    </AuthorizedWorkspacePage>
  );
}
