import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { CardLook } from "../model/card-look";
import { creatorColorOrNull, creatorColorVars, type CreatorColors } from "../model/creator-color";
import { CreatorCoverArt, coverPastelVar } from "./creator-cover-art";
import { CreatorPhoto } from "./creator-photo";
import { FandomBadge } from "./fandom-badge";
import s from "./creator-card-head.module.css";

// 크리에이터 카드 — 크리에이터 찾기·팔로우한 크리에이터가 같이 쓴다(design-rules 「크리에이터 카드·공개 프로필 머리」,
// 시안 docs/design/mockups/site/v25-card-align C안, DECISIONS 2026-10-17 카드 d103).
// 모두 가운데 정렬, 위에서 아래로: 배너 2.5:1(배경사진, 없으면 퍼스널 컬러 30% 면 또는 파스텔 + 흐린 고양이) · 얼굴 64(배너에 32 걸침)
// → 이름 한 줄 → 팬덤 뱃지 줄 → 「채널 이름 · 소개」 한 줄(CreatorCardLine) → 플랫폼 칩 한 줄(CreatorCardTags).
// 줄마다 자리가 고정이다 — 뱃지·소개·칩이 없어도 빈칸으로 남고, 이름·소개는 한 줄 말줄임(전체 이름은 title)이라 카드 높이가 같다.
// 버튼(action — 팔로우·팔로우 중·내 페이지)은 배너 오른쪽 위 모서리(위·오른쪽 8)에 높이 28, 누름 칸은 투명 여백으로 44.
// 퍼스널 컬러(INV-E13)는 배너 면·사진 테두리에만, 팬컬러는 뱃지에만.
// 카드 전체가 프로필 링크다 — 이름 링크가 카드 전체를 덮고(감싸는 카드는 position: relative), 버튼은 그 위에 올라 누름이 퍼지지 않는다.
// 배너는 카드 안쪽 여백만큼 바깥으로 나가 카드 위 가장자리에 붙는다 — 카드는 안쪽 여백 24(--space-6)·줄 사이 12·overflow: hidden 이어야 한다.

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
  /** 배너 오른쪽 위 모서리 버튼(팔로우·팔로우 중·내 페이지) */
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
      {action ? <div className={s.act}>{action}</div> : null}
      <div className={s.faceRow}>
        <CreatorPhoto photoUrl={look.photoUrl} tone={faceTone} className={`face ${s.photo}`} />
      </div>
      <p className={s.name}>
        <Link href={href} title={name}>
          {name}
        </Link>
      </p>
      <p className={s.badgeRow}>
        {look.fanName ? <FandomBadge name={look.fanName} symbolUrl={look.symbolUrl} fanColor={colors?.fan ?? null} /> : null}
      </p>
    </div>
  );
}

/** 「채널 이름 · 소개」 한 줄 — 넘치면 말줄임. 둘 다 없어도 줄 자리는 남는다(카드 높이를 같게). */
export function CreatorCardLine({ channelTitle, intro }: { channelTitle: string; intro: string }) {
  const text = [channelTitle.trim(), intro.trim()].filter(Boolean).join(" · ");
  return <p className={s.line}>{text}</p>;
}
