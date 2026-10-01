// 상자 구간 요금 — 배송비 포함 한 금액, 상자마다 (사용자 결정 d7, 2026-10-01). 결제 화면·메인 요금표·결제 금액이 모두 여기를 읽는다.
// 구간 판정(크기·무게 → 구간)은 entities/parcel 이 한다. 결제가 받는 구간은 소형·중형 둘뿐이다 — 중형 초과는 받지 않는다(d8 ③).

export type BillableTier = "small" | "medium";

export const BILLABLE_TIERS: readonly BillableTier[] = ["small", "medium"];

/** 팬이 내는 금액(확정). */
export const TIER_PRICE_KRW: Readonly<Record<BillableTier, number>> = { small: 6900, medium: 8900 };

/**
 * 결제 기록의 배송비 칸에 들어가는 택배 원가(가정 — 택배 계약 전). 나머지가 서비스료 칸이다(INV-M7).
 * 환불(검수 불합격·입고 뒤 반려·차액 미납)은 이 칸만 돌려준다(INV-M8). 계약하면 이 값만 바꾼다.
 */
export const TIER_SHIPPING_COST_KRW: Readonly<Record<BillableTier, number>> = { small: 4000, medium: 5000 };

export function isBillableTier(value: unknown): value is BillableTier {
  return value === "small" || value === "medium";
}
