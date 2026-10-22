"use client";

import Link from "next/link";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { useRef, useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { CreatorTag } from "@/entities/creator/ui/creator-tag";
import { FOLLOWING_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
import s from "./my-following.module.css";

// 팔로우한 크리에이터 본문. 시안: docs/design/mockups/site/pilot-2026-10-22/following.html (값은 pilot.css 「팔로우한 크리에이터」, design-rules 27절).
// 960 안 12열 8 + 4 — 왼쪽은 촘촘한 줄 목록(높이 72: 얼굴 40 · 이름 + 채널 칩 · 「채널 이름 · 소개」 한 줄 · 「선물 보내기」 + 「팔로우 취소」 아이콘),
// 오른쪽은 숫자 판(크림 띠 — 「팔로우」 N명 · 「크리에이터 더 찾기」 · 고양이, 스크롤하면 따라온다). 767 이하는 숫자 판이 위로 낮게(고양이 없음).
// 줄의 버튼은 찾기 화면과 같은 FollowButton(card) — 모두 팔로우 중이라 「선물 보내기」 + 「팔로우 취소」(아이콘만). 모양만 이 화면 CSS 가 바꾼다.
// 「팔로우 취소」는 확인 창을 거쳐 저장하고, 저장되면(onUnfollowed) 줄을 목록에서 빼고 초점을 제목으로 옮긴다.
// 저장 실패 알림·로그인 이동은 FollowButton 한 곳에서 한다(찾기·홈과 같다). 다 빼면 빈 화면 안내가 왼쪽 칸에 나온다.

/** 줄의 둘째 줄 — 크리에이터 카드와 같은 「채널 이름 · 소개」. 넘치면 한 줄 말줄임(전체는 title·크리에이터 페이지). */
function introLine(c: CreatorCard): string {
  return [c.channelTitle.trim(), c.intro.trim()].filter(Boolean).join(" · ");
}

export function MyFollowingPanel({
  creators,
  photos = {},
}: {
  creators: readonly CreatorCard[];
  /** 크리에이터 ID → 프로필 사진 공개 주소. 없으면 얼굴 자리표시(faceTone) */
  photos?: Readonly<Record<string, string | null>>;
}) {
  const [list, setList] = useState(creators);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // 팔로우 취소가 저장된 뒤 — 줄을 빼고, 누른 버튼이 사라지므로 초점을 제목으로(키보드 사용자가 페이지 맨 위로 튕기지 않게)
  const removeRow = (target: CreatorCard) => {
    setList((prev) => prev.filter((c) => c.id !== target.id));
    headingRef.current?.focus();
  };

  return (
    <div className={s.wrap}>
      <header className="page-head">
        <h1 className="ph-title" ref={headingRef} tabIndex={-1}>
          팔로우한 크리에이터
        </h1>
        <p className="ph-desc">{FOLLOWING_NICKNAME_NOTICE}</p>
      </header>
      <div className={s.grid}>
        <div className={s.list}>
          {list.length > 0 ? (
            <ul className={s.rows}>
              {list.map((c) => {
                const intro = introLine(c);
                return (
                  <li key={c.id} className={s.row}>
                    <CreatorPhoto photoUrl={photos[c.id] ?? null} tone={c.faceTone} className={`face face--sm ${s.face}`} />
                    <div className={s.who}>
                      <p className={s.name}>
                        <Link href={creatorPagePath(c)} title={c.name}>
                          {c.name}
                        </Link>
                        {c.platform ? <CreatorTag name={c.platform} /> : null}
                      </p>
                      <p className={s.intro} title={intro || undefined}>
                        {intro}
                      </p>
                    </div>
                    <div className={s.act}>
                      <FollowButton
                        creatorId={c.id}
                        creatorName={c.name}
                        initialFollowing
                        variant="card"
                        mode="save"
                        onUnfollowed={() => removeRow(c)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={`empty ${s.empty}`}>
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
        <aside className={s.side} aria-label="팔로우 요약">
          <div className={s.panel}>
            <div className={s.total}>
              <p className={s.label}>팔로우</p>
              <p className={s.num} data-follow-count="">
                {list.length}
                <small>명</small>
              </p>
            </div>
            <Link className="btn" href="/creators">
              크리에이터 더 찾기
            </Link>
            <img className={s.cat} src="/images/mascot-basic.png" alt="" aria-hidden="true" width={96} height={96} />
          </div>
        </aside>
      </div>
    </div>
  );
}
