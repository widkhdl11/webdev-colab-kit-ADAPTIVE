import type { ReactNode } from "react";
import type { CardLook } from "@/entities/creator/model/card-look";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { CreatorCardsSlot, guestTiles, IntroSlot, NoticesSlot, PriceSlot, PromiseSlot, SearchSlot, type FrontNotice } from "./front-slots";
import s from "./front.module.css";

// 로그인 전 첫 화면(design-rules 16절, 시안 v27-home-airy 왼쪽). 맨 위 ② 광고 배너(라우트가 넘긴 칸, 0장이면 없음 — banners INV-Y8, 2026-10-18 사용자 「위치는 제일 상단에」) → ① 검색 → ③ 소개 → ④ 새로 들어온 크리에이터 → ⑤ 약속 → ⑥ 요금 → ⑦ 공지.
// 로그인 후 팬 홈(home-page)과 같은 칸 부품을 쓴다. 본문 폭 880.

type Props = {
  prices: PublicPriceTable;
  /** 새로 들어온 크리에이터 — 최근에 들어온 순서, 라우트가 앞 넷을 넘긴다 */
  newest: readonly CreatorCard[];
  looks: Readonly<Record<string, CardLook>>;
  notices: readonly FrontNotice[];
  /** 칸 ② 광고 배너 — 라우트가 넘김 부품을 넣는다. 보일 배너가 없으면 null */
  banner?: ReactNode;
};

export function LandingPage({ prices, newest, looks, notices, banner = null }: Props) {
  return (
    <main id="main" className={`page-centered ${s.guest} ${s.root}`}>
      {banner}
      <SearchSlot tiles={guestTiles(prices)} tilesLabel="바로가기" />
      <IntroSlot />
      {newest.length > 0 ? <CreatorCardsSlot id="newest" title="새로 들어온 크리에이터" more={{ href: "/creators", label: "크리에이터 찾기" }} creators={newest} looks={looks} /> : null}
      <PromiseSlot withSignup />
      <PriceSlot prices={prices} />
      <NoticesSlot notices={notices} />
    </main>
  );
}
