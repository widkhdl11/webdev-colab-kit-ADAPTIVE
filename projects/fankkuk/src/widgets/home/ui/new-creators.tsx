"use client";

import Link from "next/link";
import { useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import type { SendAvailability } from "@/features/gift-register/model/sender-rule";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import s from "./home.module.css";

// 메인의 「새로 들어온 크리에이터」 — 태그 칩(creator-tags INV-T4)으로 거른 뒤 앞의 MAX_CARDS 명. 시안: docs/design/mockups/site/v9-home/home-b.html

/** 카드 수. PC 3열 두 줄. 나머지는 「전체 보기」(크리에이터 찾기)에서. */
const MAX_CARDS = 6;
const ALL = "전체";

type Props = {
  /** 최근에 들어온 순서. 보는 사람이 크리에이터면 자기 자신은 라우트가 빼고 넘긴다. */
  creators: readonly CreatorCard[];
  /** 태그 칩 — 라우트가 tagChips 로 정한다(숨기지 않은 선택지 중 위 크리에이터가 가진 것, 선택지 순서). 칩 하나 = 그 태그를 가진 크리에이터. */
  chips: readonly string[];
  /**
   * 카드마다 「선물 보내기」 자리(sendAvailabilityOf — 크리에이터 페이지와 같은 판단). 없으면 open.
   * needs_follow 면 「팔로우하고 선물 보내기」 — 팔로우한 크리에이터에게만 보낸다(INV-L9). 메인은 로그인한 사람만 본다.
   */
  sendOf?: Readonly<Record<string, SendAvailability>>;
};

export function NewCreators({ creators, chips, sendOf = {} }: Props) {
  const [tag, setTag] = useState(ALL);
  const shown = creators.filter((c) => tag === ALL || c.tags.includes(tag)).slice(0, MAX_CARDS);

  return (
    <>
      <div className={s.chips} role="group" aria-label="태그">
        {[ALL, ...chips].map((c) => (
          <button key={c} className="chip" type="button" aria-pressed={c === tag} onClick={() => setTag(c)}>
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
                    {[...c.tags, c.channelTitle].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <p>{c.intro}</p>
              <div className={s["c-foot"]}>
                <span className={s.sub}>{approvalTimeText(c.approvalMinutes)}</span>
                {sendOf[c.id] === "needs_follow" ? (
                  <FollowThenSend creatorId={c.id} creatorName={c.name} signedIn className="btn btn--soft btn--sm" />
                ) : (
                  <Link className="btn btn--soft btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                    선물 보내기
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
