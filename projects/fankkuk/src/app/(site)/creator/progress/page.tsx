import { redirect } from "next/navigation";
import { readCreatorActionItems } from "@/entities/action-item/api/read-action-items";
import { readMyGiftProgress } from "@/widgets/creator-gift-progress/api/read-gift-progress";
import { CREATOR_GIFT_PROGRESS_HREF } from "@/entities/gift-progress/model/progress-href";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { readSentBoxCandidates } from "@/features/box-waybill/api/read-sent-box-candidates";
import { GiftProgressPage } from "@/widgets/creator-gift-progress/ui/gift-progress-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 선물 현황(action-center INV-J9~J11). 누구 것인지는 DB 가 로그인 토큰으로 정한다(J10).
// 처리할 일 읽기는 한 번만 — 그 결과를 사이드바 숫자와 줄의 「처리할 일」 버튼에 함께 넘긴다(J6·J11, 현황이 따로 판정하지 않는다).
// 「내 상자 찾기」 후보 읽기가 실패해도 화면은 그린다(버튼만 빠진다).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [progress, items, candidates] = await Promise.all([
    readMyGiftProgress(supabase),
    readCreatorActionItems(supabase),
    readSentBoxCandidates(supabase).catch(() => []),
  ]);
  const header = await readSiteHeader(supabase, viewer, CREATOR_GIFT_PROGRESS_HREF, undefined, items);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <GiftProgressPage progress={progress} items={items} candidates={candidates} now={new Date().toISOString()} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
