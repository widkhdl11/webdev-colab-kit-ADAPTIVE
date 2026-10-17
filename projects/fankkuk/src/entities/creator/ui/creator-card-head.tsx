import type { CSSProperties, ReactNode } from "react";
import type { CardLook } from "../model/card-look";
import { creatorColorOrNull, creatorColorVars, type CreatorColors } from "../model/creator-color";
import { CreatorPhoto } from "./creator-photo";
import s from "./creator-card-head.module.css";

// 크리에이터 카드 머리 — 크리에이터가 꾸민 대로(design-rules 「크리에이터 찾기 카드 = 크리에이터가 꾸민 대로」, 2026-10-16).
// 공개 페이지 머리(widgets/creator-profile)를 작게 옮긴 모양: 맨 위 띠 = 배경사진(없으면 퍼스널 컬러 면, 그것도 없으면 옅은 하늘 면) ·
// 프로필 사진이 띠 아래 가장자리에 반쯤 걸치고 퍼스널 컬러가 있으면 그 색 테두리 · 사진 옆에 children(이름 줄 등 — 카드마다 다르다).
// 띠는 카드 안쪽 여백만큼 바깥으로 나가 카드 위 가장자리에 붙는다 — 카드는 안쪽 여백 24(--space-6)·overflow: hidden 이어야 한다.

export function CreatorCardHead({
  look,
  colors,
  faceTone,
  children,
}: {
  look: CardLook;
  colors?: CreatorColors;
  faceTone: string;
  children: ReactNode;
}) {
  const ringed = creatorColorOrNull(colors?.personal) !== null;
  const vars = creatorColorVars({ personal: colors?.personal ?? null, fan: null });
  return (
    <div className={`${s.head} ${ringed ? s.ringed : ""}`} style={vars as CSSProperties}>
      {/* 배경사진 띠 — 꾸밈이라 읽지 않는다 */}
      <div className={s.cover} aria-hidden="true">
        {look.backgroundUrl ? <img className={s.coverImg} src={look.backgroundUrl} alt="" width={1280} height={427} loading="lazy" /> : null}
      </div>
      <div className={s.top}>
        <CreatorPhoto photoUrl={look.photoUrl} tone={faceTone} className={`face ${s.photo}`} />
        <div className={s.who}>{children}</div>
      </div>
    </div>
  );
}
