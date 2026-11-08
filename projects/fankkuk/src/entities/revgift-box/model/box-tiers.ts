// 선물함 구간 (revgift-box INV-GB12·GB13·GB16·GB17). 구간 판정은 DB(실측 세 변 합·무게)가 하고, 여기서는 이름과 화면 표기만 둔다.
// 화면 표기는 요금 안내(docs/ux/pages/creator-revgifts-new.md 2페이지)와 같다 — 개인접수는 대형 초과(INV-GB16).

/** 크리에이터가 2페이지에서 고르는 구간(표시용 — 명세서는 실측 구간) */
export const CHOSEN_TIERS = ["xsmall", "small", "medium", "large"] as const;
export type ChosenTier = (typeof CHOSEN_TIERS)[number];

/** 명세서 줄의 구간 — 실측 구간, 대형을 넘으면 개인접수 */
export const INVOICE_TIERS = [...CHOSEN_TIERS, "oversize"] as const;
export type InvoiceTier = (typeof INVOICE_TIERS)[number];

export const SURCHARGE_REGIONS = ["none", "jeju", "island"] as const;
export type SurchargeRegion = (typeof SURCHARGE_REGIONS)[number];

export const TIER_NAME: Record<InvoiceTier, string> = { xsmall: "극소형", small: "소형", medium: "중형", large: "대형", oversize: "개인접수" };

/** 구간 경계(세 변 합·무게) — 요금표 표시용. 판정은 DB 규칙 함수(revgift_box_rules 의 tier_limits)가 하고, 통합 시험이 두 값이 같은지 본다 */
export const TIER_RULE: Record<ChosenTier, { sizeCm: number; weightKg: number }> = {
  xsmall: { sizeCm: 80, weightKg: 2 },
  small: { sizeCm: 100, weightKg: 5 },
  medium: { sizeCm: 120, weightKg: 10 },
  large: { sizeCm: 140, weightKg: 15 },
};

/** 할증 구분 화면 표기 — 지역 이름보다 넓지 않다(INV-GB9). 할증 없음은 표시하지 않는다 */
export const REGION_NAME: Record<Exclude<SurchargeRegion, "none">, string> = { jeju: "제주", island: "도서" };

type Price = { fees: Record<ChosenTier, number>; serviceFeeKrw: number; earlyFeeKrw: number; earlyLeft: number };

/**
 * 2페이지 예상 금액 — 고른 구간 택배비 합 + 서비스료(초기 크리에이터면 이번 달 남은 건수만큼 초기 값, 나머지 정가).
 * 표시일 뿐이다 — 명세서는 실측 뒤 서버가 그 순간의 설정값으로 계산한다(INV-GB13). 고르지 않은 줄은 세지 않는다.
 */
export function estimateKrw(chosen: readonly (ChosenTier | null)[], price: Price): number {
  const picked = chosen.filter((t): t is ChosenTier => t !== null);
  const early = Math.min(picked.length, Math.max(0, price.earlyLeft));
  return picked.reduce((sum, t) => sum + price.fees[t], 0) + early * price.earlyFeeKrw + (picked.length - early) * price.serviceFeeKrw;
}
