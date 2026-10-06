import { redirect } from "next/navigation";
import { readMyAccessLog } from "@/entities/address/api/access-log-rows";
import { readNotices } from "@/entities/notice/api/notice-reads";
import { readMyApprovalRequests } from "@/entities/order/api/creator-request-rows";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { readMyIncomingGifts } from "@/entities/order/api/incoming-gift-rows";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { CREATOR_HOME_LOG_ROWS, CreatorHomePage } from "@/widgets/creator-home/ui/creator-home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 메인 — 로그인한 크리에이터의 첫 화면.
// 승인 요청(my_approval_requests)·받은 선물 진행 단계(my_incoming_gifts, INV-W9)·열람 기록(my_access_log)·공지(list_notices)·
// 내가 보낸 선물(my_gifts — 로그인한 사람이 보낸 주문)은 DB. 모두 인자 없이 로그인 토큰의 사람 것만 돌려준다.
// 팬은 팬 메인으로, 로그인하지 않았으면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [requests, incoming, accessLog, sentGifts, allNotices] = await Promise.all([
    readMyApprovalRequests(supabase),
    readMyIncomingGifts(supabase),
    readMyAccessLog(supabase, CREATOR_HOME_LOG_ROWS),
    readMyGiftViews(supabase),
    readNotices(supabase),
  ]);
  const notices = allNotices
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader role="creator" current="/creator" nickname={viewer.nickname ?? ""} pendingCount={requests.length} />
      <CreatorHomePage
        nickname={viewer.nickname ?? ""}
        requests={requests}
        accessLog={accessLog}
        notices={notices}
        incoming={incoming}
        sentGifts={sentGifts}
      />
      <SiteFooter />
    </>
  );
}
