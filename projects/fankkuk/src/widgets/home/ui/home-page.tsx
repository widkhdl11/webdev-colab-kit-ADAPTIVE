import Link from "next/link";
import type { ReactNode } from "react";
import { ACTION_CENTER_HREF } from "@/entities/action-item/model/action-items";
import type { CardLook } from "@/entities/creator/model/card-look";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
import { CreatorCardsSlot, GiftsSlot, NoticesSlot, PriceSlot, PromiseSlot, SearchSlot, type FrontNotice, type FrontTile } from "./front-slots";
import s from "./front.module.css";
import h from "./home.module.css";

// 팬 홈(로그인 뒤, design-rules 16절, 시안 v27-home-airy 오른쪽). 로그인 전 첫 화면과 같은 칸 순서에서 바뀌는 칸만 「-2」:
// ①-2 「OO님」 + 내 바로가기 → ② 광고 배너(라우트가 넘긴 칸, 0장이면 없음 — banners INV-Y8) → ③-2 진행 중인 선물 → ④-2 팔로우한 크리에이터 → ⑤-2 약속(가입 버튼 없음) → ⑥ 요금 → ⑦ 공지.
// 「처리할 일」 칸의 숫자는 사이드바 숫자와 같은 처리할 일 읽기 결과의 줄 수다(action-center INV-J2) — 따로 세지 않는다.
// 팬 화면이라 선물은 팬용 모양(toFanView)만 받는다 — 크리에이터행 송장번호·주소가 여기 닿지 않는다.

type Props = {
  nickname: string;
  /** 진행 중인 선물 전부(최신순). 목록에는 앞의 셋만 보인다. */
  gifts: readonly FanGiftView[];
  /** 팔로우한 크리에이터(팔로우한 순서). 카드는 넷만 보인다. */
  following: readonly CreatorCard[];
  looks: Readonly<Record<string, CardLook>>;
  /** 크리에이터 이름 → 얼굴 자리표시 색. 선물 줄의 얼굴이 크리에이터 찾기와 같은 색이 되게. */
  faceToneByName: Readonly<Record<string, string>>;
  notices: readonly FrontNotice[];
  prices: PublicPriceTable;
  /** 처리할 일 카드 수 — 라우트가 처리할 일 읽기 결과의 줄 수를 넘긴다(INV-J2). 못 읽었으면 null — 칸에 숫자를 쓰지 않는다 */
  actionCount: number | null;
  /** 받은 선물(크리에이터가 보낸 선물) 수 — 받은 선물 화면 목록 전체. 못 읽었으면 null */
  receivedCount: number | null;
  /** 칸 ② 광고 배너 — 라우트가 넘김 부품을 넣는다. 보일 배너가 없으면 null */
  banner?: ReactNode;
};

/** 숫자 칸의 작은 글 — 못 읽은 수(null)는 「0건」처럼 사실로 보이지 않게 비운다 */
const countNote = (n: number | null) => (n === null ? "" : `${n}건`);

/** ①-2 내 바로가기 넷(용어집 12절) */
export function memberTiles({ gifts, actionCount, receivedCount }: Pick<Props, "gifts" | "actionCount" | "receivedCount">): FrontTile[] {
  return [
    { href: "/gifts/new", label: "선물 보내기", note: "팬꾹 주소로 먼저 보내요", icon: "icon-gift" },
    { href: "/gifts", label: "보낸 선물", note: `진행 중 ${gifts.length}건`, icon: "icon-truck" },
    { href: ACTION_CENTER_HREF, label: "처리할 일", note: countNote(actionCount), icon: "icon-log" },
    { href: "/me/revgifts", label: "받은 선물", note: countNote(receivedCount), icon: "icon-inspect" },
  ];
}

export function HomePage({ nickname, gifts, following, looks, faceToneByName, notices, prices, actionCount, receivedCount, banner = null }: Props) {
  return (
    <main id="main" className="page-pane">
      <div className={s.root}>
        {/* 광고 배너는 맨 위(2026-10-18 사용자 「위치는 제일 상단에」) */}
        {banner}
        <SearchSlot eyebrow={nickname ? `${nickname}님` : undefined} tiles={memberTiles({ gifts, actionCount, receivedCount })} tilesLabel="내 바로가기" />
        <GiftsSlot gifts={gifts} faceToneByName={faceToneByName} />
        <CreatorCardsSlot
          id="follow"
          title="팔로우한 크리에이터"
          meta={`${following.length}명`}
          more={{ href: "/me/following", label: "팔로우한 크리에이터 모두 보기" }}
          creators={following}
          looks={looks}
          action={(c) => <FollowButton creatorId={c.id} creatorName={c.name} initialFollowing variant="row" mode="save" />}
          empty={
            <>
              <p className="t-meta">아직 팔로우한 크리에이터가 없어요.</p>
              <p className={h.secFoot}>
                <Link className="btn btn--line btn--sm" href="/creators">
                  크리에이터 찾기
                </Link>
              </p>
            </>
          }
        />
        <PromiseSlot withSignup={false} />
        <PriceSlot prices={prices} />
        <NoticesSlot notices={notices} />
      </div>
    </main>
  );
}
