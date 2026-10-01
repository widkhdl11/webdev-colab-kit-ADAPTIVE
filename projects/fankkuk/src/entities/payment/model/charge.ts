import { z } from "zod";
import { BILLABLE_TIERS, isBillableTier, TIER_PRICE_KRW, TIER_SHIPPING_COST_KRW, type BillableTier } from "../config/tier-pricing";

const krw = z.number().int().nonnegative();

const breakdownSchema = z
  .object({ goodsKrw: krw, serviceFeeKrw: krw, shippingFeeKrw: krw, totalKrw: krw })
  .strict()
  // INV-M7: 세 칸의 합이 결제 금액과 같아야 한다.
  .refine((b) => b.goodsKrw + b.serviceFeeKrw + b.shippingFeeKrw === b.totalKrw);

export type ChargeBreakdown = z.infer<typeof breakdownSchema>;

/** 상자 구간 목록을 결제 구간으로 확정한다. 0개·중형 초과·모르는 값이면 실패(INV-M1). */
function billableBoxes(boxes: readonly string[]): BillableTier[] {
  if (boxes.length === 0) throw new Error("charge: 상자가 없다");
  return boxes.map((b) => {
    if (!isBillableTier(b)) throw new Error(`charge: 결제할 수 없는 구간 ${b}`);
    return b;
  });
}

/** 구간 하나의 결제 칸 나눔. 배송비 칸 = 택배 원가, 서비스료 칸 = 나머지(INV-M7). */
export function tierBreakdown(tier: BillableTier): ChargeBreakdown {
  const totalKrw = TIER_PRICE_KRW[tier];
  const shippingFeeKrw = TIER_SHIPPING_COST_KRW[tier];
  return breakdownSchema.parse({ goodsKrw: 0, serviceFeeKrw: totalKrw - shippingFeeKrw, shippingFeeKrw, totalKrw });
}

/**
 * INV-M1: 결제 금액 = 상자별 신고 구간 요금의 합. 요금은 서버 설정표에서만 읽고, 인자의 다른 칸은 쓰지 않는다.
 * 상품 대금은 대신 구매가 없는 지금 0 이다(INV-M7 칸 분리는 유지).
 */
export function computeCharge(input: { boxes: readonly string[] }): ChargeBreakdown {
  const sum = { goodsKrw: 0, serviceFeeKrw: 0, shippingFeeKrw: 0, totalKrw: 0 };
  for (const tier of billableBoxes(input.boxes)) {
    const b = tierBreakdown(tier);
    sum.serviceFeeKrw += b.serviceFeeKrw;
    sum.shippingFeeKrw += b.shippingFeeKrw;
    sum.totalKrw += b.totalKrw;
  }
  return breakdownSchema.parse(sum);
}

export type ChargeLine = { tier: BillableTier; count: number; unitKrw: number; subtotalKrw: number };

/** 결제 화면의 「상자 수 × 구간 요금」 줄. 합은 computeCharge 의 결제 금액과 같다. */
export function chargeLines(boxes: readonly string[]): ChargeLine[] {
  const tiers = billableBoxes(boxes);
  return BILLABLE_TIERS.map((tier) => {
    const count = tiers.filter((t) => t === tier).length;
    return { tier, count, unitKrw: TIER_PRICE_KRW[tier], subtotalKrw: count * TIER_PRICE_KRW[tier] };
  }).filter((line) => line.count > 0);
}

/** 저장된 결제 기록을 읽을 때의 경계. 합이 안 맞으면 null(INV-M7). */
export function parseChargeBreakdown(input: unknown): ChargeBreakdown | null {
  const parsed = breakdownSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
