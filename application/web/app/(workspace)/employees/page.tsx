import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import PeopleWorkspace from "../../components/people-workspace";

export default function EmployeesPage() {
  return (
    <AuthorizedWorkspacePage access="employees" returnPath="/employees">
      <PeopleWorkspace mode="employees" />
    </AuthorizedWorkspacePage>
  );
}
