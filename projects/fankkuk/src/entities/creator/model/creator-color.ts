// 크리에이터 「테마 색」(저장 칸 이름은 퍼스널 컬러) — 스펙 creator-link INV-E13·E14, DECISIONS 2026-11-13 「테마 색 직접 고르기」.
// - 값은 비어 있음(사이트 기본 모양) 또는 #RRGGBB(대문자) 꼴의 아무 색이다. DB 제약·DB 함수·서버 입력 경계가 같은 꼴만 받는다.
//   화면은 스타일에 넣기 직전에 꼴을 한 번 더 보고, 아니면 기본 모양으로 그린다(INV-E13).
// - 견본은 파스텔 8색(shared/config/pastel-tones) — 고를 수 있는 색의 전부가 아니라 빠른 선택이다. 「직접 고르기」로 아무 색이나 고른다.
//   「옅게 맞추기」(fitLight)는 화면 기능이다 — 서버는 진한 색도 받는다.
// - 쓰는 곳: 크리에이터 카드의 사진 없는 배너 면(그대로), 팬덤 뱃지(면 = 테마 색, 테두리 = 테마 색과 #1F2937 22% 섞은 색, 글자 = badgeInkOf),
//   크리에이터 페이지 맨 위 띠, 프로필 사진 테두리. 사이트의 버튼·링크·글자·초점 표시에는 쓰지 않는다.
// - 팬컬러는 더 이상 고르지도 그리지도 않는다 — 저장 값은 DB 에 남아 있지만 읽어 오지 않는다(INV-E13).
// - 색 위 글자색은 저장하지 않는다. 테마 색 위에 글자가 놓이는 곳은 팬덤 뱃지뿐이고 그 글자는 #000000·#FFFFFF 가운데 대비가 큰 쪽이다(INV-E14 —
//   어떤 색에서도 4.5:1 이상). 띠·배너 위에는 글자가 없어 글자색을 계산하지 않는다.
// - 값을 거르는 자리는 둘이다: DB 에서 읽을 때 creatorColorOrNull(신뢰 경계), 스타일에 넣기 직전 creatorColorVars(그리기 직전 확인).

import { PASTEL_TONES } from "@/shared/config/pastel-tones";

/** 테마 색 견본 — 파스텔 8색, 설정 화면 견본 순서 그대로(고를 수 있는 색의 전부가 아니다). */
export const THEME_COLORS = PASTEL_TONES;

/** 꼴을 확인한 테마 색 — #RRGGBB 대문자. */
export type ThemeColor = `#${string}`;

/** 팬덤 뱃지 글자 후보 둘 — 테마 색과의 대비가 큰 쪽을 쓴다(INV-E14) */
export const BADGE_INK_DARK = "#000000";
export const BADGE_INK_LIGHT = "#FFFFFF";
/** 팬덤 뱃지 테두리에 섞는 색과 비율 — 테마 색 78% + #1F2937 22%(design-rules 17절) */
export const BADGE_BORDER_INK = "#1F2937";
export const BADGE_BORDER_SHARE = 0.22;
/** 「옅게 맞추기」가 섞는 색 */
const WHITE = "#FFFFFF";
/** 「옅게 맞추기」가 닿게 하는 밝기(WCAG 상대 휘도) — 8색은 모두 0.77 이상이라 그대로다 */
export const FIT_LIGHT_MIN = 0.7;

/** 읽는 쪽(creatorColorOrNull)이 한 번 거른 값만 담는다. */
export type CreatorColors = { personal: ThemeColor | null };

export const NO_COLORS: CreatorColors = { personal: null };

const THEME_SHAPE = /^#[0-9A-F]{6}$/;

/** 저장 꼴(#RRGGBB 대문자)인가. 소문자·공백·스타일 문장은 아니다. */
export function isThemeColor(v: unknown): v is ThemeColor {
  return typeof v === "string" && THEME_SHAPE.test(v);
}

/** 저장 꼴이면 그 값, 아니면 null(기본 모양). 신뢰 경계 밖에서 온 값을 그리기 전에 거른다. */
export function creatorColorOrNull(v: unknown): ThemeColor | null {
  return isThemeColor(v) ? v : null;
}

/** 고르개가 주는 값(#rrggbb 소문자 등)을 저장 꼴로 — 꼴이 아니면 null. 앞뒤 공백·# 없는 값은 받지 않는다. */
export function toThemeColor(v: string): ThemeColor | null {
  return creatorColorOrNull(v.toUpperCase());
}

/** 사람이 치는 색 코드 칸 — 앞뒤 공백을 지우고 「#」 없이 넣어도 받는다. 꼴이 틀리면 null. */
export function toThemeColorLoose(v: string): ThemeColor | null {
  const t = v.trim();
  return toThemeColor(t.startsWith("#") ? t : `#${t}`);
}

function channel(hex: string, at: number): number {
  const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 상대 휘도. #RRGGBB(대소문자 무관)만 받는다. */
export function luminance(hex: string): number {
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

/** 팬덤 뱃지 글자색 — #000000·#FFFFFF 가운데 테마 색과의 대비가 큰 쪽(같으면 검정). 어떤 색에서도 4.5:1 이상(INV-E14). */
export function badgeInkOf(theme: ThemeColor): typeof BADGE_INK_DARK | typeof BADGE_INK_LIGHT {
  return contrastRatio(theme, BADGE_INK_DARK) >= contrastRatio(theme, BADGE_INK_LIGHT) ? BADGE_INK_DARK : BADGE_INK_LIGHT;
}

/**
 * 「옅게 맞추기」— 밝기가 FIT_LIGHT_MIN 에 못 미치면 흰색을 섞어 그 밝기에 닿는 가장 진한 색으로 바꾼다. 이미 밝으면 그대로.
 * 화면 기능이다(서버 규칙이 아니다). 섞는 비율을 반으로 나눠 가며 찾는다 — 결과는 늘 FIT_LIGHT_MIN 이상이다.
 */
export function fitLight(theme: ThemeColor): ThemeColor {
  if (luminance(theme) >= FIT_LIGHT_MIN) return theme;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (luminance(mixSrgb(theme, WHITE, mid)) >= FIT_LIGHT_MIN) hi = mid;
    else lo = mid;
  }
  return mixSrgb(theme, WHITE, hi) as ThemeColor;
}

/**
 * 그리기용 CSS 변수 — 그리기 직전 확인은 여기 한 곳이다(INV-E13). 저장 꼴일 때만 넣고, 아니면 빈 객체(사이트 기본 모양).
 * --personal(배너 면·띠·사진 테두리·뱃지 면), --personal-line(뱃지 테두리 = 테마 색 + #1F2937 22%), --personal-ink(뱃지 글자, INV-E14).
 * 부르는 쪽은 테마 모양 클래스를 붙일지 hasThemeVars 로 정한다(따로 재검사하지 않는다).
 */
export function creatorColorVars(c: { personal: string | null | undefined }): Record<string, string> {
  const theme = creatorColorOrNull(c.personal);
  return theme ? { "--personal": theme, "--personal-line": badgeBorderOf(theme), "--personal-ink": badgeInkOf(theme) } : {};
}

/** creatorColorVars 결과에 테마 색이 들어 있는가 — 테마 모양 클래스(띠·테두리·뱃지)를 붙일지 정한다. */
export function hasThemeVars(vars: Readonly<Record<string, string>>): boolean {
  return "--personal" in vars;
}
