"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { matchesCreatorQuery, type CreatorCard } from "@/entities/creator/model/creator-card";
import { tagChips, type TagOption } from "@/entities/creator/model/creator-tags";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorTag, hasTagIcon, TagChipBody, tagStyle } from "@/entities/creator/ui/creator-tag";
import { FollowButton, type FollowMode } from "@/features/creator-follow/ui/follow-button";
import s from "./creator-search.module.css";

// 크리에이터 찾기. 시안: docs/design/mockups/site/v9-pages/creators-b.html (카드 d45) · 태그 아이콘·색 tags-b.html (카드 d46)
// PC 는 왼쪽 열(검색 + 태그 세로 메뉴) · 오른쪽 한 줄에 한 명 목록, 1023px 이하는 위 칩 줄 + 목록.
// 검색창에 치는 대로 목록이 걸러진다(시안 site.js 의 실시간 검색).
// 태그 칩(creator-tags INV-T4)은 숨기지 않은 선택지 가운데 이 목록의 크리에이터 1명 이상이 가진 것만, 선택지 순서. 칩 하나를 고르면
// 그 태그를 가진 크리에이터만 — 검색어와 함께 걸린다. 칩은 한 번에 하나(여러 개 고르는 검색은 비범위).

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
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
  const shown = new Set(creators.filter((c) => matchesCreatorQuery(c, query) && (tag === "" || c.tags.includes(tag))).map((c) => c.id));
  const count = query.trim() || tag ? `검색 결과 ${shown.size}명` : `전체 ${creators.length}명`;

  return (
    <main id="main">
      <section className={s.top} aria-labelledby="find-title">
        <div className="container">
          <h1 id="find-title">
            나의 크리에이터를
            <br />
            찾아요
          </h1>
          <p className="lead">이름이나 채널 이름을 입력하면 아래 목록이 바로 걸러져요.</p>
          <p className={s.verify}>
            <CheckIcon size={20} />
            방송 채널 본인 확인을 마친 크리에이터만 보여요.
          </p>
        </div>
      </section>

      <div className={`container ${s.split}`}>
        <div className={s.side}>
          <div className="search">
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
          <h2 className={s["side-h"]}>태그</h2>
          <div className={s.cat} role="group" aria-label="태그로 걸러 보기">
            {["", ...chips].map((t) => (
              <button
                key={t || "all"}
                className="chip"
                type="button"
                aria-pressed={tag === t}
                data-icon={t !== "" && hasTagIcon(t)}
                style={t === "" ? undefined : tagStyle(t)}
                onClick={() => setTag(t)}
              >
                {t === "" ? "전체" : <TagChipBody name={t} pressed={tag === t} check={false} />}
              </button>
            ))}
          </div>
        </div>

        <section aria-label="검색 결과">
          <div className={s.bar}>
            <strong className={s.count} role="status" aria-live="polite">
              {count}
            </strong>
          </div>
          {/* 걸러진 줄은 지우지 않고 숨긴다 — 지우면 팔로우 버튼이 사라지며 누른 상태·저장 중 표시를 잃는다 */}
          <ul className={s.list} hidden={shown.size === 0}>
            {creators.map((c) => (
              <li key={c.id} className={shown.has(c.id) ? s.row : `${s.row} ${s.off}`}>
                <CreatorFace tone={c.faceTone} />
                <div>
                  <p className={s.who}>
                    <Link href={`/creators/${c.id}`}>{c.name}</Link>
                  </p>
                  <p className={s.says}>
                    {c.tags.map((t) => (
                      <CreatorTag key={t} name={t} />
                    ))}
                    {c.channelTitle ? (
                      <>
                        <span>{c.channelTitle}</span>
                        <span className={s.sep} aria-hidden="true">
                          ·
                        </span>
                      </>
                    ) : null}
                    <span>{approvalTimeText(c.approvalMinutes)}</span>
                  </p>
                </div>
                {c.id === ownCreatorId ? (
                  <div className={s.acts}>
                    <span className="tag">내 페이지</span>
                  </div>
                ) : (
                  <div className={s.acts}>
                    <FollowButton creatorId={c.id} creatorName={c.name} initialFollowing={c.following} variant="row" mode={followMode} />
                    {/* 팔로우한 줄에만 선물 보내기 — 팔로우한 크리에이터에게만 보낸다(INV-L9). 팔로우하면 화면이 다시 그려져 나타난다 */}
                    {c.following ? (
                      <Link className="btn btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                        선물 보내기
                      </Link>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {shown.size === 0 && (
            <div className={s.empty}>
              <span className={s["empty-ico"]} aria-hidden="true">
                <img className="asset" src="/img/illust-empty-search.png" alt="" width={64} height={64} />
              </span>
              <h2>찾는 크리에이터가 아직 없어요</h2>
              <p className="sub">이름 철자를 다시 확인해 보세요. 본인 확인을 마치지 않은 크리에이터는 검색되지 않아요.</p>
              <Link className={`btn btn--soft ${s["empty-cta"]}`} href="/support">
                크리에이터를 초대하고 싶어요
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
