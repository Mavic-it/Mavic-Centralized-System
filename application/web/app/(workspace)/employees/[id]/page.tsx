import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import PeopleWorkspace from "../../../components/people-workspace";

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AuthorizedWorkspacePage
      access="employee-profile"
      returnPath={`/employees/${id}`}
    >
      <PeopleWorkspace employeeId={id} mode="employee-profile" />
    </AuthorizedWorkspacePage>
  );
}
