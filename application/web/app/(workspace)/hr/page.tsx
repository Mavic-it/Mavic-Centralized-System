import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import PeopleWorkspace from "../../components/people-workspace";

export default function HrPage() {
  return (
    <AuthorizedWorkspacePage access="hr" returnPath="/hr">
      <PeopleWorkspace mode="hr" />
    </AuthorizedWorkspacePage>
  );
}
