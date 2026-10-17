// 크리에이터 색 — 퍼스널 컬러(크리에이터 페이지 맨 위 띠·프로필 사진 테두리)와 팬컬러(팬덤 뱃지 테두리·옅은 면). 스펙 creator-link INV-E13·E14.
// - 저장 형식은 #RRGGBB 대문자 하나뿐이다(DB 제약이 같은 꼴만 받는다). 화면은 스타일에 넣기 직전에 이 꼴을 한 번 더 보고, 아니면 기본 모양으로 그린다(INV-E13).
// - 색 위 글자색은 저장하지 않고 여기서 그때 계산한다 — 흰색과 #111827 가운데 WCAG 상대 휘도 대비가 큰 쪽(INV-E14).
//   퍼스널 컬러 띠 위 글자가 이 계산을 쓴다. 팬덤 뱃지 글자는 계산하지 않고 #111827 고정이다(면이 팬컬러 28% 로 옅다, INV-E14).
//   대비가 낮다고 색을 거부하지 않는다(카드 d91).

/** 저장된 색의 꼴 — # 뒤 16진수 여섯 자리, 대문자. */
export const CREATOR_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

/** 어두운 색 위 글자 */
export const TEXT_LIGHT = "#FFFFFF";
/** 밝은 색 위 글자 */
export const TEXT_DARK = "#111827";

export type CreatorColors = { personal: string | null; fan: string | null };

export const NO_COLORS: CreatorColors = { personal: null, fan: null };

/** 저장 꼴(#RRGGBB 대문자)이면 그 값, 아니면 null(기본 모양). 신뢰 경계 밖에서 온 값을 그리기 전에 거른다. */
export function creatorColorOrNull(v: unknown): string | null {
  return typeof v === "string" && CREATOR_COLOR_PATTERN.test(v) ? v : null;
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

/** 그 바탕 위 글자색 — 흰색과 #111827 가운데 대비가 큰 쪽(INV-E14). 같으면 흰색. */
export function textOnColor(bg: string): typeof TEXT_LIGHT | typeof TEXT_DARK {
  return contrastRatio(bg, TEXT_DARK) > contrastRatio(bg, TEXT_LIGHT) ? TEXT_DARK : TEXT_LIGHT;
}

/**
 * 그리기용 CSS 변수 — 꼴이 맞는 색만 넣는다. 없으면 그 칸은 사이트 기본 모양(부르는 쪽 CSS 의 기본값).
 * --personal·--on-personal(띠·테두리·띠 위 글자), --fan(뱃지 테두리·옅은 면 — 글자는 #111827 고정이라 글자색 변수가 없다).
 */
export function creatorColorVars(c: CreatorColors): Record<string, string> {
  const out: Record<string, string> = {};
  const personal = creatorColorOrNull(c.personal);
  const fan = creatorColorOrNull(c.fan);
  if (personal) {
    out["--personal"] = personal;
    out["--on-personal"] = textOnColor(personal);
  }
  if (fan) out["--fan"] = fan;
  return out;
}

/** 색 입력 칸 한 칸 읽기 — 빈 칸이면 기본(null), # 뒤 16진수 여섯 자리(대소문자 무관)면 대문자로. 그 밖은 틀림. 서버 입력 경계와 같은 규칙이다. */
export function parseColorField(raw: string): { ok: true; value: string | null } | { ok: false } {
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  return /^#[0-9A-Fa-f]{6}$/.test(v) ? { ok: true, value: v.toUpperCase() } : { ok: false };
}
