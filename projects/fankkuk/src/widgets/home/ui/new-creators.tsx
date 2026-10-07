"use client";

import Link from "next/link";
import { useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import s from "./home.module.css";

// 메인의 「새로 들어온 크리에이터」 — 분야 칩으로 거른 뒤 앞의 MAX_CARDS 명. 시안: docs/design/mockups/site/v9-home/home-b.html

/** 카드 수. PC 3열 두 줄. 나머지는 「전체 보기」(크리에이터 찾기)에서. */
const MAX_CARDS = 6;
const ALL = "전체";

/** creators 는 최근에 들어온 순서로 받는다. */
export function NewCreators({ creators }: { creators: readonly CreatorCard[] }) {
  const [category, setCategory] = useState(ALL);
  const categories = [ALL, ...new Set(creators.map((c) => c.category))];
  const shown = creators.filter((c) => category === ALL || c.category === category).slice(0, MAX_CARDS);

  return (
    <>
      <div className={s.chips} role="group" aria-label="분야">
        {categories.map((c) => (
          <button key={c} className="chip" type="button" aria-pressed={c === category} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className={s.empty}>아직 소개할 크리에이터가 없어요.</p>
      ) : (
        <ul className={s["c-grid"]}>
          {shown.map((c) => (
            <li key={c.id} className={s["c-card"]}>
              <div className={s["c-top"]}>
                <CreatorFace tone={c.faceTone} className="face face--lg" />
                <div>
                  <h3>
                    <Link href={`/creators/${c.id}`}>{c.name}</Link>
                  </h3>
                  <p className={s["c-meta"]}>
                    <span className="tag">{c.platform}</span> {c.category} · {c.channelTitle}
                  </p>
                </div>
              </div>
              <p>{c.intro}</p>
              <div className={s["c-foot"]}>
                <span className={s.sub}>{approvalTimeText(c.approvalMinutes)}</span>
                <Link className="btn btn--soft btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                  선물 보내기
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
