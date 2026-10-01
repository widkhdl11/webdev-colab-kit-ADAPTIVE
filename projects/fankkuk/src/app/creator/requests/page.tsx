import { SAMPLE_CREATORS, SAMPLE_SIGNED_IN_CREATOR_ID } from "@/entities/creator/api/sample-creators";
import { SAMPLE_ORDERS } from "@/entities/order/api/sample-orders";
import { pendingApprovalRequests } from "@/entities/order/model/creator-view";
import { ApprovalRequestsPage } from "@/widgets/approval-requests/ui/approval-requests-page";

// 예시 데이터로 그린다. 크리에이터 화면은 주문 기록을 그대로 받지 않고 승인 요청 모양만 받는다.
export default function Page() {
  const creator = SAMPLE_CREATORS.find((c) => c.id === SAMPLE_SIGNED_IN_CREATOR_ID);
  const requests = pendingApprovalRequests(SAMPLE_ORDERS, SAMPLE_SIGNED_IN_CREATOR_ID);
  return <ApprovalRequestsPage creatorName={creator?.name ?? ""} requests={requests} />;
}
