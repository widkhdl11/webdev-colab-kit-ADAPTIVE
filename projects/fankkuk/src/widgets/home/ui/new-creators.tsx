"use client";

import Link from "next/link";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { hasPickedTag } from "@/entities/creator/model/creator-tags";
import { FOLLOW_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import type { SendAvailability } from "@/features/gift-register/model/sender-rule";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorTag, hasTagIcon, TagChipBody, tagStyle } from "@/entities/creator/ui/creator-tag";
import s from "./home.module.css";

// 메인의 「새로 들어온 크리에이터」 — 태그 칩(creator-tags INV-T4)으로 거른 뒤 앞의 MAX_CARDS 명. 시안: docs/design/mockups/site/v11/home-fan.html (.chips · .grid.cols-3 · .ccard)
// 태그 칩·카드 태그의 아이콘·플랫폼 색은 v9-pages/tags-b.html 4절 (카드 d46).

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
  const shown = creators.filter((c) => hasPickedTag(c, tag === ALL ? null : tag)).slice(0, MAX_CARDS);

  return (
    <>
      <div className={`chips ${s.chips}`} role="group" aria-label="태그">
        {[ALL, ...chips].map((c) => (
          <button
            key={c}
            className="chip"
            type="button"
            aria-pressed={c === tag}
            data-icon={c !== ALL && hasTagIcon(c)}
            style={c === ALL ? undefined : tagStyle(c)}
            onClick={() => setTag(c)}
          >
            {c === ALL ? c : <TagChipBody name={c} pressed={c === tag} />}
          </button>
        ))}
      </div>
      {shown.some((c) => sendOf[c.id] === "needs_follow") ? <p className="section-hint">{FOLLOW_NICKNAME_NOTICE}</p> : null}
      {shown.length === 0 ? (
        <p className="empty">아직 소개할 크리에이터가 없어요.</p>
      ) : (
        <ul className="grid cols-3">
          {shown.map((c) => (
            <li key={c.id} className="card ccard">
              <div className="ccard-top">
                <CreatorFace tone={c.faceTone} />
                <div>
                  <h3>
                    <Link href={creatorPagePath(c)}>{c.name}</Link>
                  </h3>
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
              <p className="intro">{c.intro}</p>
              <div className="ccard-foot">
                <span className="t-meta">{approvalTimeText(c.approvalMinutes)}</span>
                {sendOf[c.id] === "needs_follow" ? (
                  <FollowThenSend creatorId={c.id} creatorName={c.name} signedIn className="btn btn--line btn--sm btn--block" />
                ) : (
                  <Link className="btn btn--line btn--sm btn--block" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
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
