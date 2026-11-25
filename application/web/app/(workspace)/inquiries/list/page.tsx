import { Suspense } from "react";
import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import InquiryWorkspace from "../../../inquiries/workspace";
import InquiryLoading from "../../../inquiries/inquiry-loading";
export default function Page() {
  return (
    <AuthorizedWorkspacePage access="inquiries" returnPath="/inquiries/list">
      <Suspense fallback={<InquiryLoading section="list" />}>
        <InquiryWorkspace section="list" />
      </Suspense>
    </AuthorizedWorkspacePage>
  );
}
