import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import AttendanceWorkspace from "../../attendance/workspace";

export default function AttendancePage() {
  return (
    <AuthorizedWorkspacePage access="attendance" returnPath="/attendance">
      <AttendanceWorkspace />
    </AuthorizedWorkspacePage>
  );
}
