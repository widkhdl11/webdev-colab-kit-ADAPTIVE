import { SAMPLE_DECIDED_REQUESTS } from "@/entities/order/api/sample-decided-requests";
import { SAMPLE_ORDERS } from "@/entities/order/api/sample-orders";
import { SAMPLE_SIGNED_IN_CREATOR_ID } from "@/entities/creator/api/sample-creators";
import { pendingApprovalRequests } from "@/entities/order/model/creator-view";
import { ApprovalRequestsPage } from "@/widgets/approval-requests/ui/approval-requests-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleCreatorHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 크리에이터 화면은 주문 기록을 그대로 받지 않고 승인 요청 모양만 받는다.
export default function Page() {
  const requests = pendingApprovalRequests(SAMPLE_ORDERS, SAMPLE_SIGNED_IN_CREATOR_ID);
  return (
    <>
      <SiteHeader {...sampleCreatorHeader("/creator/requests")} />
      <ApprovalRequestsPage requests={requests} decided={SAMPLE_DECIDED_REQUESTS} />
      <SiteFooter />
    </>
  );
}
