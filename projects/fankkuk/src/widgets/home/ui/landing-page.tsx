import type { ReactNode } from "react";
import type { CardLook } from "@/entities/creator/model/card-look";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { CreatorCardsSlot, guestTiles, HeroBand, IntroSlot, NoticesSlot, PriceSlot, RoleHome, type FrontNotice } from "./front-slots";

// 로그인 전 첫 화면(design-rules 16절, 시안 v29-landing-fix). ① 첫 화면 띠 → ② 소개 배너(2026-10-19 사용자 선택 이미지.
// 2026-10-18 사용자 「위치는 제일 상단에」를 같은 날 「추천대로」로 첫 화면 아래로 바꿈) → 바로가기 넷 → ③ 소개 → ④ 새로 들어온 크리에이터 → ⑤ 약속 띠 → ⑥ 요금 → ⑦ 공지.
// 배경 띠(①·⑤)는 화면 끝까지 칠하고 글은 880 기둥. 로그인 후 팬 홈(home-page)과 같은 칸 부품을 쓰되, 띠·흰 바로가기·한 장 요금은 이 화면만의 모양이다.

type Props = {
  prices: PublicPriceTable;
  /** 새로 들어온 크리에이터 — 최근에 들어온 순서로 최대 열둘을 넘겨 본다 */
  newest: readonly CreatorCard[];
  looks: Readonly<Record<string, CardLook>>;
  notices: readonly FrontNotice[];
  /** 칸 ② 소개 배너 — 라우트가 사용자 선택 이미지를 넣는다. */
  banner?: ReactNode;
};

export function LandingPage({ prices, newest, looks, notices, banner = null }: Props) {
  return (
    <RoleHome hero={<HeroBand />} tiles={guestTiles(prices)} tilesLabel="바로가기" banner={banner}>
        <IntroSlot />
        {newest.length > 0 ? <CreatorCardsSlot id="newest" title="새로 들어온 크리에이터" more={{ href: "/creators", label: "크리에이터 찾기" }} creators={newest} looks={looks} scroll /> : null}
        <PriceSlot prices={prices} joined />
        <NoticesSlot notices={notices} />
    </RoleHome>
  );
}
