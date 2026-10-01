"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { matchesCreatorQuery, type CreatorCard } from "@/entities/creator/model/creator-card";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
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

export function CreatorSearchPage({ creators }: { creators: readonly CreatorCard[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const categories = [...new Set(creators.map((c) => c.category))];
  const shown = creators.filter((c) => matchesCreatorQuery(c, query));
  const count = query.trim() ? `검색 결과 ${shown.length}명` : `전체 ${creators.length}명`;

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
            <button className="search-go" type="button" aria-label="찾기">
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
                <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>
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
          {shown.length > 0 ? (
            <ul className={s.list}>
              {shown.map((c) => (
                <li key={c.id} className={s.row}>
                  <CreatorFace tone={c.faceTone} />
                  <div>
                    <p className={s.who}>
                      <Link href={`/creators/${c.id}`}>{c.name}</Link>
                    </p>
                    <p className={s.says}>
                      {c.category} · {c.channelTitle} · 평균 승인 약 {c.avgApprovalHours}시간
                    </p>
                  </div>
                  <div className={s.acts}>
                    <FollowButton creatorName={c.name} initialFollowing={c.following} variant="row" />
                    <Link className="btn btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                      선물 보내기
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={s.empty} role="status">
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
