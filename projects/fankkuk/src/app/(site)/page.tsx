import { redirect } from "next/navigation";
import { readCreatorCards, readCreatorSearchLooks } from "@/entities/creator/api/creator-reads";
import { toCardLooks } from "@/entities/creator/model/card-look";
import { newestFirst } from "@/entities/creator/model/newest-creators";
import { readNotices } from "@/entities/notice/api/notice-reads";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { CARD_ROW_MAX } from "@/widgets/home/ui/front-slots";
import { LandingPage } from "@/widgets/home/ui/landing-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 소개 첫 화면(design-rules 16절). 로그인된 상태면 바로 메인으로(PRODUCT ③). 손님 헤더로 남겨 두면 로그인이 풀린 것처럼 보인다.
// 「새로 들어온 크리에이터」는 크리에이터 찾기와 같은 목록(본인 확인됨 + 찾기 노출 켜짐 — my-account INV-A10)을 들어온 순서의 거꾸로 앞 넷. 공지는 최신 셋.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const home = signedInHome(viewer);
  if (home) redirect(home);
  const [prices, creators, looks, noticeRows] = await Promise.all([
    readPublicPrices(supabase),
    readCreatorCards(supabase, { signedIn: false, forSearch: true }),
    readCreatorSearchLooks(supabase),
    readNotices(supabase),
  ]);
  const newest = newestFirst(creators, CARD_ROW_MAX);
  const notices = noticeRows
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader role="guest" current="/" />
      <LandingPage prices={prices} newest={newest} looks={toCardLooks(newest, looks, readPublicStorageBase())} notices={notices} />
      <SiteFooter />
    </>
  );
}
