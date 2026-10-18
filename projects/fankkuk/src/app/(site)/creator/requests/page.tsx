import { redirect } from "next/navigation";
import { readMyDecidedRequests } from "@/entities/order/api/creator-request-rows";
import { CREATOR_ACTION_CENTER_HREF } from "@/entities/action-item/model/creator-action-items";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { ApprovalRequestsPage } from "@/widgets/approval-requests/ui/approval-requests-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 — 승인 내역(DB 읽기 함수 my_decided_requests — 그 크리에이터의 것만). 대기 중인 승인 요청은 처리할 일에서 처리한다(action-center INV-J5·J6).
// 받은 선물(상자·받았어요·답장)은 v18 시안대로 /creator/boxes — 옛 주소 ?tab=received 는 그 화면으로, ?tab=checks(옛 확인할 선물 탭)는 처리할 일로 보낸다.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const { tab } = await searchParams;
  if (tab === "received") redirect("/creator/boxes");
  if (tab === "checks") redirect(CREATOR_ACTION_CENTER_HREF);
  const [decided, header] = await Promise.all([readMyDecidedRequests(supabase), readSiteHeader(supabase, viewer, "/creator/requests")]);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <ApprovalRequestsPage decided={decided} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
