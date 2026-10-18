"use client";

import Link from "next/link";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { useRef, useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import {
  NO_CARD_LOOK,
  type CardLook,
} from "@/entities/creator/model/card-look";
import { CreatorCardActions, CreatorCardFoot, CreatorCardHead, CreatorCardLine, creatorCardClass } from "@/entities/creator/ui/creator-card-head";
import { FOLLOWING_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
import s from "./my-following.module.css";

// 팔로우한 크리에이터 본문. 시안: docs/design/mockups/site/v18/my-following.html (페이지 머리) · 카드와 격자는 크리에이터 찾기와 같은 카드(design-rules 17절).
// 카드 아래 띠는 찾기 화면과 같은 FollowButton(card) — 모두 팔로우 중이라 「선물 보내기」 + 「팔로우 취소」(아이콘만).
// 「팔로우 취소」는 확인 창을 거쳐 저장하고, 저장되면(onUnfollowed) 카드를 목록에서 빼고 초점을 제목으로 옮긴다.
// 저장 실패 알림·로그인 이동은 FollowButton 한 곳에서 한다(찾기·홈과 같다). 다 빼면 빈 화면 안내가 나온다.

export function MyFollowingPanel({
  creators,
  looks = {},
}: {
  creators: readonly CreatorCard[];
  looks?: Readonly<Record<string, CardLook>>;
}) {
  const [list, setList] = useState(creators);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 팔로우 취소가 저장된 뒤 — 카드를 빼고, 누른 버튼이 사라지므로 초점을 제목으로(키보드 사용자가 페이지 맨 위로 튕기지 않게)
  const removeCard = (target: CreatorCard) => {
    setList((prev) => prev.filter((c) => c.id !== target.id));
    headingRef.current?.focus();
  };

  return (
    <div>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title" ref={headingRef} tabIndex={-1}>
            팔로우한 크리에이터
            <span className="ph-count">{list.length}</span>
          </h1>
          <Link className="btn btn--sm" href="/creators">
            크리에이터 더 찾기
          </Link>
        </div>
        <p className="ph-desc">{FOLLOWING_NICKNAME_NOTICE}</p>
      </header>
      {list.length > 0 ? (
        <div className={s.results}>
        <ul className={s.grid}>
          {list.map((c) => {
            const look = looks[c.id] ?? NO_CARD_LOOK;
            return (
              <li key={c.id} className={creatorCardClass}>
                <CreatorCardHead
                  creatorId={c.id}
                  name={c.name}
                  href={creatorPagePath(c)}
                  look={look}
                  colors={c.colors}
                  faceTone={c.faceTone}
                />
                <CreatorCardLine channelTitle={c.channelTitle} intro={c.intro} />
                <CreatorCardFoot tags={c.tags} />
                <CreatorCardActions creatorId={c.id} colors={c.colors}>
                  <FollowButton
                    creatorId={c.id}
                    creatorName={c.name}
                    initialFollowing
                    variant="card"
                    mode="save"
                    onUnfollowed={() => removeCard(c)}
                  />
                </CreatorCardActions>
              </li>
            );
          })}
        </ul>
        </div>
      ) : (
        <div className={`card empty ${s.empty}`}>
          <img
            src="/img/illust-empty-follow.png"
            alt=""
            aria-hidden="true"
            width={96}
            height={96}
          />
          <h2 className="t-card">아직 팔로우한 크리에이터가 없어요</h2>
          <p className="t-desc">
            좋아하는 크리에이터를 팔로우하면 여기에 모아 두고, 바로 선물을 보낼
            수 있어요.
          </p>
          <Link className="btn" href="/creators">
            나의 크리에이터 찾으러 가기
          </Link>
        </div>
      )}
    </div>
  );
}
