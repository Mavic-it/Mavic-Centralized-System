import { AppearanceSettings } from "../../../appearance/appearance-settings";
import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";

export default function AppearancePage() {
  return <AuthorizedWorkspacePage access="appearance" returnPath="/system/appearance"><AppearanceSettings /></AuthorizedWorkspacePage>;
}
