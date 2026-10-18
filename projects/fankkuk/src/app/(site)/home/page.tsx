import { redirect } from "next/navigation";
import { readActionItemsOrNull } from "@/entities/action-item/api/read-action-items";
import { readCreatorCards, readCreatorLooks } from "@/entities/creator/api/creator-reads";
import { toCardLooks } from "@/entities/creator/model/card-look";
import { readFanProfile } from "@/entities/fan/api/read-fan-profile";
import { readNotices } from "@/entities/notice/api/notice-reads";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { fanGiftBucket } from "@/entities/order/ui/fan-stage-copy";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { readReceivedRevgiftsOrNull } from "@/entities/revgift/api/revgift-reads";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { CARD_ROW_MAX } from "@/widgets/home/ui/front-slots";
import { HomePage } from "@/widgets/home/ui/home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 팬 메인(design-rules 16절, 시안 v27-home-airy 오른쪽). 진행 중 선물·팔로우·받은 선물·요금·공지 모두 DB. 공지 줄은 고정 여부와 상관없이 최신 셋.
// 「진행 중」은 선물 내역의 「진행 중」 탭과 같은 기준(fanGiftBucket)이다.
// 크리에이터는 크리에이터 메인으로, 로그인하지 않았으면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  // 서로 기대지 않는 읽기는 한꺼번에. 머리말 닉네임은 프로필에서 — 못 읽으면 세션의 닉네임.
  // 처리할 일은 한 번 읽어 사이드바 숫자와 바로가기 「처리할 일」 칸에 함께 넘긴다(action-center INV-J2). 못 읽으면 칸의 숫자와 사이드바 뱃지를 뺀다. 받은 선물 수도 못 읽으면 칸의 숫자만 뺀다
  const [all, cards, fanProfile, noticeRows, actions, received, prices] = await Promise.all([
    readMyGiftViews(supabase),
    readCreatorCards(supabase, { signedIn: true }),
    readFanProfile(supabase, viewer.userId),
    readNotices(supabase),
    readActionItemsOrNull(supabase),
    readReceivedRevgiftsOrNull(supabase),
    readPublicPrices(supabase),
  ]);
  const gifts = all.filter((v) => fanGiftBucket(v) === "ongoing");
  const following = cards.filter((c) => c.following);
  const shown = following.slice(0, CARD_ROW_MAX);
  // 카드 꾸밈은 보이는 넷만 읽는다 — 찾기 노출을 끈 크리에이터도 팔로우 카드에는 보여 id 로 읽는다(팔로우한 크리에이터 화면과 같다)
  const looks = shown.length > 0 ? toCardLooks(shown, await readCreatorLooks(supabase, shown.map((c) => c.id)), readPublicStorageBase()) : {};
  const faceToneByName = Object.fromEntries(cards.map((c) => [c.name, c.faceTone]));
  const notices = noticeRows
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/home", all, actions)} />
      <HomePage
        nickname={fanProfile?.nickname ?? viewer.nickname ?? ""}
        gifts={gifts}
        following={following}
        looks={looks}
        faceToneByName={faceToneByName}
        notices={notices}
        prices={prices}
        actionCount={actions?.length ?? null}
        receivedCount={received?.length ?? null}
      />
      <SiteFooter />
    </>
  );
}
