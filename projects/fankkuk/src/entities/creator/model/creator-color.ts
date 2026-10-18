// 크리에이터 「테마 색」(저장 칸 이름은 퍼스널 컬러) — 스펙 creator-link INV-E13·E14, DECISIONS 2026-10-18 「크리에이터 카드 v28 · 테마 색」.
// - 값은 비어 있음(사이트 기본 모양) 또는 파스텔 8색(shared/config/pastel-tones, 대문자) 가운데 하나뿐이다. DB 제약이 같은 목록만 받는다.
//   화면은 스타일에 넣기 직전에 8색 가운데 하나인지 한 번 더 보고, 아니면 기본 모양으로 그린다(INV-E13).
// - 쓰는 곳: 크리에이터 카드의 사진 없는 배너 면(그대로), 팬덤 뱃지(면 = 테마 색, 테두리 = 테마 색과 #1F2937 22% 섞은 색, 글자 #111827),
//   크리에이터 페이지 맨 위 띠, 프로필 사진 테두리. 사이트의 버튼·링크·글자·초점 표시에는 쓰지 않는다.
// - 팬컬러는 더 이상 고르지도 그리지도 않는다 — 저장 값은 DB 에 남아 있지만 읽어 오지 않는다(INV-E13).
// - 색 위 글자색은 저장하지 않는다. 테마 색 위에 글자가 놓이는 곳은 팬덤 뱃지뿐이고 그 글자는 #111827 고정이다(INV-E14 — 8색 모두 12:1 이상).
//   띠·배너 위에는 글자가 없어 글자색을 계산하지 않는다.
// - 값을 거르는 자리는 둘이다: DB 에서 읽을 때 creatorColorOrNull(신뢰 경계), 스타일에 넣기 직전 creatorColorVars(그리기 직전 확인).

import { PASTEL_TONES, type PastelTone } from "@/shared/config/pastel-tones";

/** 고를 수 있는 테마 색 — 파스텔 8색, 설정 화면 견본 순서 그대로. */
export const THEME_COLORS = PASTEL_TONES;

export type ThemeColor = PastelTone;

/** 팬덤 뱃지 글자(테마 색 위) — 고정(INV-E14). CSS 토큰 --badge-ink 와 같은 값이다 */
export const TEXT_DARK = "#111827";
/** 팬덤 뱃지 테두리에 섞는 색과 비율 — 테마 색 78% + #1F2937 22%(design-rules 17절) */
export const BADGE_BORDER_INK = "#1F2937";
export const BADGE_BORDER_SHARE = 0.22;

/** 읽는 쪽(creatorColorOrNull)이 한 번 거른 값만 담는다. */
export type CreatorColors = { personal: ThemeColor | null };

export const NO_COLORS: CreatorColors = { personal: null };

const THEME_SET: ReadonlySet<string> = new Set(THEME_COLORS);

/** 8색 가운데 하나(대문자 저장 꼴)인가. */
export function isThemeColor(v: unknown): v is ThemeColor {
  return typeof v === "string" && THEME_SET.has(v);
}

/** 8색 가운데 하나면 그 값, 아니면 null(기본 모양). 신뢰 경계 밖에서 온 값을 그리기 전에 거른다. */
export function creatorColorOrNull(v: unknown): ThemeColor | null {
  return isThemeColor(v) ? v : null;
}

function channel(hex: string, at: number): number {
  const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 상대 휘도. #RRGGBB(대소문자 무관)만 받는다. */
function luminance(hex: string): number {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`색 형식이 아니다: ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** 두 색의 대비(1~21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 두 색을 sRGB 로 섞는다 — CSS color-mix(in srgb, a (1-share), b share) 와 같은 계산. */
export function mixSrgb(a: string, b: string, share: number): string {
  const part = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const out = [1, 3, 5].map((at) => Math.round(part(a, at) * (1 - share) + part(b, at) * share));
  return `#${out.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** 팬덤 뱃지 테두리 색 — 테마 색과 #1F2937 22%. */
export function badgeBorderOf(theme: ThemeColor): string {
  return mixSrgb(theme, BADGE_BORDER_INK, BADGE_BORDER_SHARE);
}

/**
 * 그리기용 CSS 변수 — 그리기 직전 확인은 여기 한 곳이다(INV-E13). 8색 가운데 하나일 때만 넣고, 아니면 빈 객체(사이트 기본 모양).
 * --personal(배너 면·띠·사진 테두리·뱃지 면), --personal-line(뱃지 테두리 = 테마 색 + #1F2937 22%).
 * 부르는 쪽은 테마 모양 클래스를 붙일지 hasThemeVars 로 정한다(따로 재검사하지 않는다).
 */
export function creatorColorVars(c: { personal: string | null | undefined }): Record<string, string> {
  const theme = creatorColorOrNull(c.personal);
  return theme ? { "--personal": theme, "--personal-line": badgeBorderOf(theme) } : {};
}

/** creatorColorVars 결과에 테마 색이 들어 있는가 — 테마 모양 클래스(띠·테두리·뱃지)를 붙일지 정한다. */
export function hasThemeVars(vars: Readonly<Record<string, string>>): boolean {
  return "--personal" in vars;
}
