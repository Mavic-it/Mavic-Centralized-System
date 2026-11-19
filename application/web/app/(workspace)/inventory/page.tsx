import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import InventoryWorkspace from "./workspace";

export default function InventoryPage() {
  return (
    <AuthorizedWorkspacePage access="inventory" returnPath="/inventory">
      <InventoryWorkspace />
    </AuthorizedWorkspacePage>
  );
}
