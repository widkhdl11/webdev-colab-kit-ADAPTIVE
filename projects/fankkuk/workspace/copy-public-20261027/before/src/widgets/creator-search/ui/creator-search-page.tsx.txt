"use client";

import Link from "next/link";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { useId, useState, type ReactNode } from "react";
import {
  matchesCreatorQuery,
  type CreatorCard,
} from "@/entities/creator/model/creator-card";
import {
  hasPickedTag,
  tagChips,
  type TagOption,
} from "@/entities/creator/model/creator-tags";
import {
  NO_CARD_LOOK,
  type CardLook,
} from "@/entities/creator/model/card-look";
import { CreatorCardActions, CreatorCardFoot, CreatorCardHead, CreatorCardLine, CreatorCardMineRow, creatorCardClass } from "@/entities/creator/ui/creator-card-head";
import {
  hasTagIcon,
  TagChipBody,
} from "@/entities/creator/ui/creator-tag";
import {
  FollowButton,
  type FollowMode,
} from "@/features/creator-follow/ui/follow-button";
import { FOLLOW_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import s from "./creator-search.module.css";

// 크리에이터 찾기. 시안: docs/design/mockups/site/v18/creators.html (design-rules 00절) · 태그 아이콘·색 v9-pages/tags-b.html (카드 d46)
// 위에서 아래로: 광고 배너(0장이면 없음) → 페이지 머리(제목 24 왼쪽·설명·본인 확인 줄) → 왼쪽부터 꽉 찬 검색창 → 태그 칩 → 「전체 N명」 → 카드 격자(880 기둥 → 화면 1024 이상 3열 · 640 이상 2열 · 그 아래 1열).
// 본문 틀: 로그인 후는 목록형 기본 폭(.page-pane 880 — 2026-10-16 사용자 「꼭 넓은 너비가 필요한 페이지가 아니다」), 로그인 전은 상단 바와 같은 880 선(.pub-inner — 2026-10-18 1152 → 880) — 로그인 전 상단 바 아래에서 넓은 틀이 상단 바 선을 벗어나지 않게.
// 카드는 크리에이터가 꾸민 대로 — entities/creator/ui/creator-card-head·creator-card-tags(시안 v28-card-redesign, design-rules 17절: 배너 2:1 ·
// 사진 왼쪽 + 이름·팬덤 뱃지 한 줄 · 「채널 이름 · 소개」 한 줄 · 칩 한 줄 · 하단 줄에 평균 승인 시간과 팔로우). 팔로우한 크리에이터·홈과 같은 카드다.
// 광고 배너는 본문 맨 위(2026-10-18 사용자 「위치는 제일 상단에」 — 시안 v18 의 태그 칩 아래 자리에서 옮김) — 라우트가 넘김 부품을 넣는다(banners INV-Y7·Y8, 0장이면 없음).
// 검색창에 치는 대로 목록이 걸러진다(시안 site.js 의 실시간 검색).
// 태그 칩(creator-tags INV-T4)은 숨기지 않은 선택지 가운데 이 목록의 크리에이터 1명 이상이 가진 것만, 선택지 순서. 칩 하나를 고르면
// 그 태그를 가진 크리에이터만 — 검색어와 함께 걸린다. 칩은 한 번에 하나(여러 개 고르는 검색은 비범위).

// 본인 확인 안내 앞 선 아이콘(lucide badge-check, 시안 v18 #i-badge-check)
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/**
 * looks: 크리에이터 id → 꾸민 모양. 없는 사람은 기본 모양.
 * ownCreatorId: 로그인한 크리에이터 자신의 줄 — 팔로우 대신 「내 페이지」 태그(자기 자신은 팔로우 불가).
 * tagOptions: 숨기지 않은 태그 선택지(선택지 순서) — 칩 순서를 정한다.
 */
export function CreatorSearchPage({
  creators,
  looks = {},
  tagOptions,
  followMode,
  ownCreatorId = null,
  banner = null,
}: {
  creators: readonly CreatorCard[];
  looks?: Readonly<Record<string, CardLook>>;
  tagOptions: readonly TagOption[];
  followMode: FollowMode;
  ownCreatorId?: string | null;
  /** 광고 배너 칸 — 보일 배너가 없으면 null */
  banner?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const inputId = useId();
  const chips = tagChips(tagOptions, creators);
  const shown = new Set(
    creators
      .filter(
        (c) =>
          matchesCreatorQuery(c, query) &&
          hasPickedTag(c, tag === "" ? null : tag),
      )
      .map((c) => c.id),
  );
  const count =
    query.trim() || tag
      ? `검색 결과 ${shown.size}명`
      : `전체 ${creators.length}명`;

  const frame = followMode === "login" ? `pub-inner ${s.pub}` : "page-pane";

  return (
    <main id="main" className={frame}>
      {/* 광고 배너는 맨 위(2026-10-18 사용자 「위치는 제일 상단에」) */}
      {banner}
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title" id="find-title">
            나의 크리에이터를 찾아요
          </h1>
        </div>
        <p className="ph-desc">
          이름이나 채널 이름을 입력하면 아래 목록이 바로 걸러져요.
        </p>
        <p className={s.verify}>
          <CheckIcon />
          활동 채널 본인 확인을 마친 크리에이터만 보여요.
        </p>
      </header>
      <div className={`search ${s.search}`}>
        <label className="sr-only" htmlFor={inputId}>
          크리에이터 이름 또는 채널 이름
        </label>
        <input
          id={inputId}
          type="search"
          placeholder="예: 하루, 치지직, 새벽달 라디오"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {/* 치는 대로 걸러지므로 누를 버튼이 없다 — 돋보기는 장식 */}
        <span className="search-go" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="m21 21-4.34-4.34"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
      {/* 칩 줄 제목 — 칩이 검색창 바로 아래 한 줄로 와서 눈에는 보이지 않게 두고 문서 개요에만 남긴다 */}
      <h2 className="sr-only">태그</h2>
      <div className={s.chips} role="group" aria-label="태그로 걸러 보기">
        {["", ...chips].map((t) => (
          <button
            key={t || "all"}
            className={s.chip}
            type="button"
            aria-pressed={tag === t}
            data-icon={t !== "" && hasTagIcon(t)}
            onClick={() => setTag(t)}
          >
            {t === "" ? "전체" : <TagChipBody name={t} pressed={tag === t} />}
          </button>
        ))}
      </div>

      <section className={s.results} aria-label="검색 결과">
        <p className={s.bar} role="status" aria-live="polite">
          {count}
        </p>
        {followMode === "save" ? (
          <p className={s.hint}>{FOLLOW_NICKNAME_NOTICE}</p>
        ) : null}
        {/* 걸러진 카드는 지우지 않고 숨긴다 — 지우면 팔로우 버튼이 사라지며 누른 상태·저장 중 표시를 잃는다 */}
        <ul className={s.grid} hidden={shown.size === 0}>
          {creators.map((c) => {
            const own = c.id === ownCreatorId;
            const look = looks[c.id] ?? NO_CARD_LOOK;
            return (
              <li key={c.id} className={creatorCardClass} hidden={!shown.has(c.id)}>
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
                {/* 본인은 버튼 줄 자리에 「내 페이지」 태그, 운영자(hidden)는 줄 없음 — 운영자 화면은 모든 카드에 줄이 없어 높이가 같다 */}
                {own ? (
                  <CreatorCardMineRow creatorId={c.id} colors={c.colors} />
                ) : followMode === "hidden" ? null : (
                  <CreatorCardActions creatorId={c.id} colors={c.colors}>
                    <FollowButton
                      creatorId={c.id}
                      creatorName={c.name}
                      initialFollowing={c.following}
                      variant="card"
                      mode={followMode}
                    />
                  </CreatorCardActions>
                )}
              </li>
            );
          })}
        </ul>
        {shown.size === 0 && (
          <div className="empty">
            <img
              className="asset"
              src="/img/illust-empty-search.png"
              alt=""
              width={96}
              height={96}
            />
            <h2 className="t-card">찾는 크리에이터가 아직 없어요</h2>
            <p className="t-desc">
              이름 철자를 다시 확인해 보세요. 본인 확인을 마치지 않은
              크리에이터는 검색되지 않아요.
            </p>
            <Link className="btn btn--line" href="/support">
              크리에이터를 초대하고 싶어요
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
