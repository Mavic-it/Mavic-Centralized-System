import AuthorizedWorkspacePage from "../../components/authorized-workspace-page";
import MyProfileWorkspace from "../../components/my-profile-workspace";
import MyProfileQueryProvider from "../../components/my-profile-query-provider";

export default function MyProfilePage() {
  return (
    <AuthorizedWorkspacePage access="my-profile" returnPath="/my-profile">
      <MyProfileQueryProvider>
        <MyProfileWorkspace />
      </MyProfileQueryProvider>
    </AuthorizedWorkspacePage>
  );
}
