import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { CardLook } from "../model/card-look";
import { creatorColorOrNull, creatorColorVars, type CreatorColors } from "../model/creator-color";
import { CreatorCoverArt, coverPastelVar } from "./creator-cover-art";
import { CreatorPhoto } from "./creator-photo";
import { FandomBadge } from "./fandom-badge";
import s from "./creator-card-head.module.css";

// 크리에이터 카드 — 크리에이터 찾기·팔로우한 크리에이터가 같이 쓴다(design-rules 「크리에이터 카드·공개 프로필 머리」, 시안 v24-creator-card, DECISIONS d101·d102).
// 위에서 아래로: 배너 2.5:1(배경사진, 없으면 퍼스널 컬러 30% 면 또는 파스텔 + 흐린 고양이) · 사진 64(배너에 32 걸침)와
// 이름 + 팬덤 뱃지(왼쪽) · 작은 버튼(이름 줄 오른쪽 끝, action) → 「채널 이름 · 소개」 한 줄(CreatorCardLine) → 플랫폼 칩(카드마다 그린다).
// 카드 안 폭 280 이하(4열·3열)면 팬덤 뱃지만 이름 아래 줄로 내려간다. 승인 시간·「선물 보내기」는 카드에 두지 않는다(d102).
// 퍼스널 컬러(INV-E13)는 배너 면·사진 테두리에만, 팬컬러는 뱃지 면에만.
// 카드 전체가 프로필 링크다 — 이름 링크가 카드 전체를 덮고(감싸는 카드는 position: relative), 버튼은 그 위에 올라 누름이 퍼지지 않는다.
// 배너는 카드 안쪽 여백만큼 바깥으로 나가 카드 위 가장자리에 붙는다 — 카드는 안쪽 여백 24(--space-6)·overflow: hidden 이어야 한다.

export function CreatorCardHead({
  creatorId,
  name,
  href,
  look,
  colors,
  faceTone,
  action,
}: {
  creatorId: string;
  name: string;
  href: string;
  look: CardLook;
  colors?: CreatorColors;
  faceTone: string;
  /** 이름 줄 오른쪽 끝 버튼(팔로우·팔로우 중·내 페이지) */
  action?: ReactNode;
}) {
  const ringed = creatorColorOrNull(colors?.personal) !== null;
  const vars = creatorColorVars({ personal: colors?.personal ?? null, fan: null });
  return (
    <div className={`${s.head} ${ringed ? s.ringed : ""}`} style={vars as CSSProperties}>
      {/* 배너 — 꾸밈이라 읽지 않는다 */}
      <div className={s.cover} style={coverPastelVar(creatorId)} aria-hidden="true">
        <CreatorCoverArt imageUrl={look.backgroundUrl} />
      </div>
      <div className={s.top}>
        <CreatorPhoto photoUrl={look.photoUrl} tone={faceTone} className={`face ${s.photo}`} />
        <div className={s.who}>
          <p className={s.name}>
            <Link href={href}>{name}</Link>
            {look.fanName ? <FandomBadge name={look.fanName} symbolUrl={look.symbolUrl} fanColor={colors?.fan ?? null} /> : null}
          </p>
        </div>
        {action ? <div className={s.act}>{action}</div> : null}
      </div>
    </div>
  );
}

/** 「채널 이름 · 소개」 한 줄 — 넘치면 말줄임. 둘 다 없으면 줄이 없다. */
export function CreatorCardLine({ channelTitle, intro }: { channelTitle: string; intro: string }) {
  const text = [channelTitle.trim(), intro.trim()].filter(Boolean).join(" · ");
  return text ? <p className={s.line}>{text}</p> : null;
}
