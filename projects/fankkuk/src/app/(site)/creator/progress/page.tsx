import { redirect } from "next/navigation";
import { readCreatorActionItems } from "@/entities/action-item/api/read-action-items";
import { readMyGiftProgress } from "@/widgets/creator-gift-progress/api/read-gift-progress";
import { CREATOR_GIFT_PROGRESS_HREF } from "@/entities/gift-progress/model/progress-href";
import { readApprovalCancelTargets } from "@/entities/order/api/approval-cancel-rows";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { readSentBoxCandidates } from "@/features/box-waybill/api/read-sent-box-candidates";
import { GiftProgressPage } from "@/widgets/creator-gift-progress/ui/gift-progress-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 선물 현황(action-center INV-J9~J11). 누구 것인지는 DB 가 로그인 토큰으로 정한다(J10).
// 처리할 일 읽기는 한 번만 — 그 결과를 사이드바 숫자와 줄의 「처리할 일」 버튼에 함께 넘긴다(J6·J11, 현황이 따로 판정하지 않는다).
// 「내 상자 찾기」 후보 읽기·승인 취소 대상 읽기가 실패해도 화면은 그린다(버튼만 빠진다).
// 승인 취소 대상(approval-cancel INV-AC4)은 앱 서버 키 전용 읽기 — 세션에서 확인한 사람 ID 만 넘긴다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [progress, items, candidates, cancelTargets] = await Promise.all([
    readMyGiftProgress(supabase),
    readCreatorActionItems(supabase),
    readSentBoxCandidates(supabase).catch(() => []),
    readApprovalCancelTargets(createAdminSupabase(), viewer.userId).catch((e: unknown) => {
      // 버튼만 빠진다 — 조용히 사라지지 않게 서버 기록에 한 줄
      console.error(`승인 취소 대상을 읽지 못했다(선물 현황): ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }),
  ]);
  const header = await readSiteHeader(supabase, viewer, CREATOR_GIFT_PROGRESS_HREF, items);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <GiftProgressPage progress={progress} items={items} candidates={candidates} cancelTargets={cancelTargets} now={new Date().toISOString()} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
