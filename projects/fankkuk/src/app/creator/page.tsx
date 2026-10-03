import { redirect } from "next/navigation";
import { SAMPLE_ACCESS_LOG } from "@/entities/address/api/sample-access-log";
import { readNotices } from "@/entities/notice/api/notice-reads";
import { readMyApprovalRequests } from "@/entities/order/api/creator-request-rows";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { CreatorHomePage } from "@/widgets/creator-home/ui/creator-home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 메인 — 로그인한 크리에이터의 첫 화면.
// 승인 요청(my_approval_requests)·공지(list_notices)·내가 보낸 선물(my_gifts — 로그인한 사람이 보낸 주문)은 DB.
// 열람 기록은 아직 DB 읽기가 없어 열람 기록 화면과 같은 예시 데이터를 쓴다.
// 팬은 팬 메인으로, 로그인하지 않았으면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [requests, sentGifts, allNotices] = await Promise.all([
    readMyApprovalRequests(supabase),
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
        accessLog={SAMPLE_ACCESS_LOG}
        notices={notices}
        sentGifts={sentGifts}
      />
      <SiteFooter />
    </>
  );
}
