"use client";

import Link from "next/link";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { useId, useState } from "react";
import { matchesCreatorQuery, type CreatorCard } from "@/entities/creator/model/creator-card";
import { hasPickedTag, tagChips, type TagOption } from "@/entities/creator/model/creator-tags";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorTag, hasTagIcon, TagChipBody } from "@/entities/creator/ui/creator-tag";
import { FollowButton, type FollowMode } from "@/features/creator-follow/ui/follow-button";
import { FOLLOW_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import s from "./creator-search.module.css";

// 크리에이터 찾기. 시안: docs/design/mockups/site/v11/creators.html (design-rules 0절) · 태그 아이콘·색 v9-pages/tags-b.html (카드 d46)
// 위에서 아래로 한 줄: 제목·안내 → 검색창 → 태그 칩 → 「전체 N명」 → 같은 크기 카드 격자(PC 3열 · 1023px 이하 2열 · 767px 이하 1열).
// 검색창에 치는 대로 목록이 걸러진다(시안 site.js 의 실시간 검색).
// 태그 칩(creator-tags INV-T4)은 숨기지 않은 선택지 가운데 이 목록의 크리에이터 1명 이상이 가진 것만, 선택지 순서. 칩 하나를 고르면
// 그 태그를 가진 크리에이터만 — 검색어와 함께 걸린다. 칩은 한 번에 하나(여러 개 고르는 검색은 비범위).

// 본인 확인 안내 앞 동그란 체크(시안 v11 #check)
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      <path d="m5 10 3 3 7-7" fill="none" stroke="var(--white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * ownCreatorId: 로그인한 크리에이터 자신의 줄 — 팔로우·선물 보내기를 보이지 않는다(자기 자신은 팔로우·선물 불가).
 * tagOptions: 숨기지 않은 태그 선택지(선택지 순서) — 칩 순서를 정한다.
 */
export function CreatorSearchPage({
  creators,
  tagOptions,
  followMode,
  ownCreatorId = null,
}: {
  creators: readonly CreatorCard[];
  tagOptions: readonly TagOption[];
  followMode: FollowMode;
  ownCreatorId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const inputId = useId();
  const chips = tagChips(tagOptions, creators);
  const shown = new Set(creators.filter((c) => matchesCreatorQuery(c, query) && hasPickedTag(c, tag === "" ? null : tag)).map((c) => c.id));
  const count = query.trim() || tag ? `검색 결과 ${shown.size}명` : `전체 ${creators.length}명`;

  return (
    <main id="main">
      <section className="section section--compact" aria-labelledby="find-title">
        <div className="container">
          <div className="sec-head">
            <h1 className="t-title" id="find-title">
              나의 크리에이터를 찾아요
            </h1>
            <p className="t-lead t-desc">이름이나 채널 이름을 입력하면 아래 목록이 바로 걸러져요.</p>
            <p className={s.verify}>
              <CheckIcon />
              방송 채널 본인 확인을 마친 크리에이터만 보여요.
            </p>
          </div>
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
                <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
                <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          {/* 칩 줄 제목 — 칩이 검색창 바로 아래 한 줄로 와서 눈에는 보이지 않게 두고 문서 개요에만 남긴다 */}
          <h2 className="sr-only">태그</h2>
          <div className={`chips ${s.chips}`} role="group" aria-label="태그로 걸러 보기">
            {["", ...chips].map((t) => (
              <button key={t || "all"} className="chip" type="button" aria-pressed={tag === t} data-icon={t !== "" && hasTagIcon(t)} onClick={() => setTag(t)}>
                {t === "" ? "전체" : <TagChipBody name={t} pressed={tag === t} />}
              </button>
            ))}
          </div>

          <section aria-label="검색 결과">
            <p className={`bar t-strong ${s.bar}`} role="status" aria-live="polite">
              {count}
            </p>
            {followMode === "save" ? <p className="section-hint">{FOLLOW_NICKNAME_NOTICE}</p> : null}
            {/* 걸러진 카드는 지우지 않고 숨긴다 — 지우면 팔로우 버튼이 사라지며 누른 상태·저장 중 표시를 잃는다 */}
            <ul className="grid cols-3" hidden={shown.size === 0}>
              {creators.map((c) => {
                const own = c.id === ownCreatorId;
                return (
                  <li key={c.id} className="card ccard" hidden={!shown.has(c.id)}>
                    <div className="ccard-top">
                      <CreatorFace tone={c.faceTone} />
                      <div>
                        <p className={`t-card ${s.name}`}>
                          <Link href={creatorPagePath(c)}>{c.name}</Link>
                        </p>
                        {c.channelTitle ? <p className="t-meta">{c.channelTitle}</p> : null}
                      </div>
                    </div>
                    {c.tags.length > 0 ? (
                      <p className="ctags">
                        {c.tags.map((t) => (
                          <CreatorTag key={t} name={t} />
                        ))}
                      </p>
                    ) : null}
                    {/* 팔로우한 카드에만 선물 보내기 — 팔로우한 크리에이터에게만 보낸다(INV-L9). 팔로우하면 화면이 다시 그려져 나타난다 */}
                    <div className={!own && c.following ? "ccard-foot two" : "ccard-foot"}>
                      <span className="t-meta">{approvalTimeText(c.approvalMinutes)}</span>
                      {own ? (
                        <span className={`tag ${s.own}`}>내 페이지</span>
                      ) : (
                        <>
                          <FollowButton creatorId={c.id} creatorName={c.name} initialFollowing={c.following} variant="row" mode={followMode} />
                          {c.following ? (
                            <Link className="btn btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                              선물 보내기
                            </Link>
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {shown.size === 0 && (
              <div className="empty">
                <img className="asset" src="/img/illust-empty-search.png" alt="" width={96} height={96} />
                <h2 className="t-card">찾는 크리에이터가 아직 없어요</h2>
                <p className="t-desc">이름 철자를 다시 확인해 보세요. 본인 확인을 마치지 않은 크리에이터는 검색되지 않아요.</p>
                <Link className="btn btn--line" href="/support">
                  크리에이터를 초대하고 싶어요
                </Link>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
