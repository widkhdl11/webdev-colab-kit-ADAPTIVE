import { redirect } from "next/navigation";
import { readMyApprovalRequests, readMyDecidedRequests } from "@/entities/order/api/creator-request-rows";
import { ApprovalRequestsPage } from "@/widgets/approval-requests/ui/approval-requests-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터에게 온 승인 요청(DB 읽기 함수 — 그 크리에이터의 것만, 결제가 끝난 주문만, 크리에이터가 봐도 되는 칸만).
// 승인 버튼은 아직 서명 대기 표시까지다 — 카카오 인증서 서명은 딜러사 연결 뒤에 붙는다(INV-S7: 승인 입구는 서명 검증 하나).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role !== "creator") redirect("/login");
  const [requests, decided] = await Promise.all([readMyApprovalRequests(supabase), readMyDecidedRequests(supabase)]);
  return (
    <>
      <SiteHeader role="creator" current="/creator/requests" nickname={viewer.nickname ?? ""} pendingCount={requests.length} />
      <ApprovalRequestsPage requests={requests} decided={decided} />
      <SiteFooter />
    </>
  );
}
