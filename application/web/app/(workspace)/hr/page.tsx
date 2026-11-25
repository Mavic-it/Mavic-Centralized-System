import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import AnalyticsWorkspace from "../../analytics/workspace";

export default function HrPage() {
  return <AuthorizedWorkspacePage access="hr" returnPath="/hr"><AnalyticsWorkspace mode="hr" /></AuthorizedWorkspacePage>;
}
