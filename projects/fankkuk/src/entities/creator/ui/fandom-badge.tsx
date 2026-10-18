import type { CSSProperties } from "react";
import { creatorColorVars, hasThemeVars, type ThemeColor } from "../model/creator-color";
import s from "./creator-head.module.css";

// 팬덤 뱃지 — 팬덤 이름 + 팬마크(팬덤 심볼). 크리에이터의 테마 색으로 그린다(creator-link INV-E13·E14, design-rules 17절, 시안 v28-card-redesign .fn):
// 면 = 테마 색 그대로, 테두리 1px = 테마 색과 #1F2937 22% 섞은 색, 글자 #111827 고정.
// 테마 색이 없거나 8색 밖이면 사이트 기본 모양(옅은 면 + 회색 테두리). 색은 creatorColorVars 가 8색인지 한 번 더 본 뒤에만 스타일에 들어간다.
// 크기(색 모양은 셋 다 같다):
// - small(기본) = 크리에이터 카드·상세 설정 미리보기의 작은 뱃지 — 높이 22 · 글자 12 · 마크 14
// - medium = 공개 프로필 머리·크리에이터 머리(큰 이름 옆) — 높이 28 · 글자 14 · 마크 20
// - large = 상세 설정 미리보기의 큰 뱃지 — 높이 40 · 글자 16 · 마크 30(시안 v21-addendum3 .fb--lg)

export type FandomBadgeSize = "small" | "medium" | "large";

const SIZE_CLASS: Record<FandomBadgeSize, string> = { small: "", medium: s.fbMd, large: s.fbLg };

export function FandomBadge({
  name,
  symbolUrl,
  themeColor,
  size = "small",
}: {
  name: string;
  /** 팬덤 심볼 공개 주소 — 없으면 마크 칸 없이 이름만 */
  symbolUrl: string | null;
  /** 크리에이터의 테마 색(저장 칸 이름 퍼스널 컬러) — 없으면 기본 뱃지 */
  themeColor: ThemeColor | null;
  size?: FandomBadgeSize;
}) {
  const vars = creatorColorVars({ personal: themeColor });
  const tinted = hasThemeVars(vars);
  return (
    <span className={`${s.fb} ${tinted ? s.fbTheme : ""} ${SIZE_CLASS[size]}`} style={vars as CSSProperties} data-fandom-badge="">
      {symbolUrl ? (
        <span className={s.fbMark} aria-hidden="true">
          <img src={symbolUrl} alt="" width={512} height={512} />
        </span>
      ) : null}
      <span className={s.fbt}>{name}</span>
    </span>
  );
}
