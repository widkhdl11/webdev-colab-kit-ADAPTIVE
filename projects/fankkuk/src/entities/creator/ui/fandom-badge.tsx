import type { CSSProperties } from "react";
import { creatorColorOrNull, creatorColorVars } from "../model/creator-color";
import s from "./creator-head.module.css";

// 팬덤 뱃지 — 팬덤 이름 + 팬마크(팬덤 심볼). 설정한 팬컬러는 1px 테두리, 면은 팬컬러 28% + 흰색, 글자는 #111827 고정(creator-link INV-E14,
// DECISIONS 2026-10-17 카드 d103, 시안 docs/design/mockups/site/v25-card-align C안 .fn2). 팬컬러는 여전히 뱃지에만 쓰인다(INV-E13).
// 팬컬러가 없거나 꼴이 틀리면 사이트 기본 모양(옅은 면 + 회색 테두리). 색은 creatorColorVars 가 꼴을 한 번 더 본 뒤에만 스타일에 들어간다.
// 크기(색 모양은 셋 다 같다):
// - small(기본) = 크리에이터 카드·상세 설정 미리보기의 작은 뱃지 — 높이 22 · 글자 12 · 마크 14
// - medium = 공개 프로필 머리·크리에이터 머리(큰 이름 옆) — 높이 28 · 글자 14 · 마크 20
// - large = 상세 설정 미리보기의 큰 뱃지 — 높이 40 · 글자 16 · 마크 30(시안 v21-addendum3 .fb--lg)

export type FandomBadgeSize = "small" | "medium" | "large";

const SIZE_CLASS: Record<FandomBadgeSize, string> = { small: "", medium: s.fbMd, large: s.fbLg };

export function FandomBadge({
  name,
  symbolUrl,
  fanColor,
  size = "small",
}: {
  name: string;
  /** 팬덤 심볼 공개 주소 — 없으면 마크 칸 없이 이름만 */
  symbolUrl: string | null;
  fanColor: string | null;
  size?: FandomBadgeSize;
}) {
  const vars = creatorColorVars({ personal: null, fan: fanColor });
  const tinted = creatorColorOrNull(fanColor) !== null;
  return (
    <span className={`${s.fb} ${tinted ? s.fbFan : ""} ${SIZE_CLASS[size]}`} style={vars as CSSProperties} data-fandom-badge="">
      {symbolUrl ? (
        <span className={s.fbMark} aria-hidden="true">
          <img src={symbolUrl} alt="" width={512} height={512} />
        </span>
      ) : null}
      <span className={s.fbt}>{name}</span>
    </span>
  );
}
