"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { matchesCreatorQuery, type CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { FollowButton, type FollowMode } from "@/features/creator-follow/ui/follow-button";
import s from "./creator-search.module.css";

// 크리에이터 찾기. 시안: docs/design/mockups/site/v4/creators.html
// 검색창에 치는 대로 목록이 걸러진다(시안 site.js 의 실시간 검색). 분야 칩은 검색창에 그 말을 채운다.

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ownCreatorId: 로그인한 크리에이터 자신의 줄 — 팔로우·선물 보내기를 보이지 않는다(자기 자신은 팔로우·선물 불가). */
export function CreatorSearchPage({
  creators,
  followMode,
  ownCreatorId = null,
}: {
  creators: readonly CreatorCard[];
  followMode: FollowMode;
  ownCreatorId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const categories = [...new Set(creators.map((c) => c.category))];
  const shown = new Set(creators.filter((c) => matchesCreatorQuery(c, query)).map((c) => c.id));
  const count = query.trim() ? `검색 결과 ${shown.size}명` : `전체 ${creators.length}명`;

  return (
    <main id="main">
      <section className={s.find} aria-labelledby="find-title">
        <div className="container">
          <h1 id="find-title">
            나의 크리에이터를
            <br />
            찾아요
          </h1>
          <p className="lead">이름이나 채널 이름을 입력하면 아래 목록이 바로 걸러져요.</p>
          <div className="search">
            <label className="sr-only" htmlFor={inputId}>
              크리에이터 이름 또는 채널 이름
            </label>
            <input
              id={inputId}
              type="search"
              placeholder="예: 하루, 게임, 새벽달 라디오"
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
          <p className={s.verify}>
            <CheckIcon size={20} />
            방송 채널 본인 확인을 마친 크리에이터만 보여요.
          </p>
          <div className={s.chips} role="group" aria-label="분야로 걸러 보기">
            {["", ...categories].map((cat) => (
              <button key={cat || "all"} className="chip" type="button" aria-pressed={query === cat} onClick={() => setQuery(cat)}>
                {cat || "전체"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={s.result} aria-label="검색 결과">
        <div className="container">
          <div className={s["result-bar"]}>
            <strong role="status" aria-live="polite">
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
                    {c.category} · {c.channelTitle} · {approvalTimeText(c.approvalMinutes)}
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
        </div>
      </section>
    </main>
  );
}
