import { Suspense } from "react";
import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import InquiryWorkspace from "../../../inquiries/workspace";
import InquiryLoading from "../../../inquiries/inquiry-loading";
export default function Page() {
  return (
    <AuthorizedWorkspacePage
      access="inquiries"
      returnPath="/inquiries/settings"
    >
      <Suspense fallback={<InquiryLoading section="settings" />}>
        <InquiryWorkspace section="settings" />
      </Suspense>
    </AuthorizedWorkspacePage>
  );
}
