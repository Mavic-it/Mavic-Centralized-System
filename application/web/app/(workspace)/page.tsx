import AuthorizedWorkspacePage from "../components/authorized-workspace-page";
import AnalyticsWorkspace from "../analytics/workspace";

export default function Home() {
  return <AuthorizedWorkspacePage access="overview" returnPath="/"><AnalyticsWorkspace mode="overview" /></AuthorizedWorkspacePage>;
}
