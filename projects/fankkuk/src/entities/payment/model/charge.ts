import { z } from "zod";
import { isPricedTier, PRICED_TIERS, type PriceTable, type PricedTier } from "./price-table";

const krw = z.number().int().nonnegative();

const breakdownSchema = z
  .object({ goodsKrw: krw, serviceFeeKrw: krw, inspectionFeeKrw: krw, shippingFeeKrw: krw, totalKrw: krw })
  .strict()
  // INV-M7: 네 칸(상품 대금·기본 서비스료·검수비·배송비)의 합이 결제 금액과 같아야 한다.
  .refine((b) => b.goodsKrw + b.serviceFeeKrw + b.inspectionFeeKrw + b.shippingFeeKrw === b.totalKrw);

export type ChargeBreakdown = z.infer<typeof breakdownSchema>;

/** 상자 구간 목록을 결제 구간으로 확정한다. 0개·대형 초과·모르는 값이면 실패(INV-M1 · admin-console INV-K6). */
function pricedBoxes(boxes: readonly string[]): PricedTier[] {
  if (boxes.length === 0) throw new Error("charge: 상자가 없다");
  return boxes.map((b) => {
    if (!isPricedTier(b)) throw new Error(`charge: 결제할 수 없는 구간 ${b}`);
    return b;
  });
}

/** 구간 하나의 결제 칸 나눔. 배송비 칸 = 택배 원가, 검수비 칸 = 구간 검수비, 기본 서비스료 칸 = 나머지(INV-M7). */
export function tierBreakdown(prices: PriceTable, tier: PricedTier): ChargeBreakdown {
  const p = prices[tier];
  return breakdownSchema.parse({
    goodsKrw: 0,
    serviceFeeKrw: p.priceKrw - p.carrierCostKrw - p.inspectionFeeKrw,
    inspectionFeeKrw: p.inspectionFeeKrw,
    shippingFeeKrw: p.carrierCostKrw,
    totalKrw: p.priceKrw,
  });
}

/** 역조공 상자 요금 = 팬 선물 요금 − 검수비 (reverse-gift INV-R3). 저장하지 않고 늘 계산한다(INV-K4). */
export function revgiftTierPrice(prices: PriceTable, tier: PricedTier): number {
  return prices[tier].priceKrw - prices[tier].inspectionFeeKrw;
}

/** 역조공 구간 하나의 칸 나눔 — 팬 선물과 같고 검수비 칸만 0 이다. */
export function revgiftTierBreakdown(prices: PriceTable, tier: PricedTier): ChargeBreakdown {
  const fan = tierBreakdown(prices, tier);
  return breakdownSchema.parse({ ...fan, inspectionFeeKrw: 0, totalKrw: fan.totalKrw - fan.inspectionFeeKrw });
}

function sumBreakdowns(parts: readonly ChargeBreakdown[]): ChargeBreakdown {
  const sum = { goodsKrw: 0, serviceFeeKrw: 0, inspectionFeeKrw: 0, shippingFeeKrw: 0, totalKrw: 0 };
  for (const b of parts) {
    sum.goodsKrw += b.goodsKrw;
    sum.serviceFeeKrw += b.serviceFeeKrw;
    sum.inspectionFeeKrw += b.inspectionFeeKrw;
    sum.shippingFeeKrw += b.shippingFeeKrw;
    sum.totalKrw += b.totalKrw;
  }
  return breakdownSchema.parse(sum);
}

/** INV-R3: 역조공 결제 금액 = 몫마다 고른 구간의 역조공 요금 합. 인자의 다른 칸은 쓰지 않는다. */
export function computeRevgiftCharge(prices: PriceTable, input: { boxes: readonly string[] }): ChargeBreakdown {
  return sumBreakdowns(pricedBoxes(input.boxes).map((t) => revgiftTierBreakdown(prices, t)));
}

/**
 * INV-M1 · INV-K3: 결제 금액 = 상자별 신고 구간 요금의 합. 요금은 넘겨받은 요금표(등록 순간 DB 에서 읽은 것)에서만 읽고,
 * 인자의 다른 칸은 쓰지 않는다. 상품 대금은 대신 구매가 없는 지금 0 이다(INV-M7 칸 분리는 유지).
 */
export function computeCharge(prices: PriceTable, input: { boxes: readonly string[] }): ChargeBreakdown {
  return sumBreakdowns(pricedBoxes(input.boxes).map((t) => tierBreakdown(prices, t)));
}

export type ChargeLine = { tier: PricedTier; count: number; unitKrw: number; subtotalKrw: number };

/** 결제 화면의 「상자 수 × 구간 요금」 줄. 합은 computeCharge 의 결제 금액과 같다. */
export function chargeLines(prices: PriceTable, boxes: readonly string[]): ChargeLine[] {
  const tiers = pricedBoxes(boxes);
  return PRICED_TIERS.map((tier) => {
    const count = tiers.filter((t) => t === tier).length;
    const unitKrw = prices[tier].priceKrw;
    return { tier, count, unitKrw, subtotalKrw: count * unitKrw };
  }).filter((line) => line.count > 0);
}

/** 저장된 결제 기록을 읽을 때의 경계. 합이 안 맞으면 null(INV-M7). */
export function parseChargeBreakdown(input: unknown): ChargeBreakdown | null {
  const parsed = breakdownSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
