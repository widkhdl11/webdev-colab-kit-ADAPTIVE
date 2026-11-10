import type { BoxServiceFees } from "@/entities/payment/model/box-service-fees";
import type { ShipTier } from "@/entities/payment/model/carrier-pricing";
import { PRICED_TIERS, type PriceTable, type PricedTier, type TierPrice } from "@/entities/payment/model/price-table";
import type { CarrierPricingBody } from "./save-carrier-pricing";

// 손님이 내는 요금을 올리는 저장인지 (ux pages/admin-pricing.md 「요금을 올려 저장할 때 30일 공지 확인 창」).
// 화면이 확인 창을 띄울지만 정한다 — 저장 규칙·서버 판정은 그대로다.
// 손님이 내는 칸: 팬 선물 받는 값 · 팬에게 보내기 택배비 · 선물함 서비스료 정가·초기.
// 택배 원가·기본 경로·검수비는 손님 금액이 아니라 보지 않는다. 같은 값은 오른 것이 아니다.

type Pair = { savedKrw: number; nextKrw: number };

function anyRaised(pairs: readonly Pair[]): boolean {
  // 숫자가 아닌 입력(NaN)은 저장 전 검사가 막는다 — 여기서는 오름으로 치지 않는다
  return pairs.some((p) => Number.isFinite(p.nextKrw) && p.nextKrw > p.savedKrw);
}

/** 요금표 — 받는 값만 본다(택배 원가·검수비는 손님 금액이 아니다) */
export function raisesPriceTable(saved: PriceTable, next: Readonly<Record<PricedTier, TierPrice>>): boolean {
  return anyRaised(PRICED_TIERS.map((tier) => ({ savedKrw: saved[tier].priceKrw, nextKrw: next[tier].priceKrw })));
}

/** 선물함 서비스료 — 정가·초기 둘 다 손님 금액 */
export function raisesBoxServiceFees(saved: BoxServiceFees, next: BoxServiceFees): boolean {
  return anyRaised([
    { savedKrw: saved.regularKrw, nextKrw: next.regularKrw },
    { savedKrw: saved.earlyKrw, nextKrw: next.earlyKrw },
  ]);
}

/**
 * 경로표 양식 — 팬에게 보내기 택배비와 함께 저장하는 팬 선물 받는 값만 본다.
 * 경로별 택배 원가·기본 경로는 손님 금액이 아니다. 인자는 저장 몸통(바뀐 칸만 실린다)이다.
 */
export function raisesCarrierPricing(
  savedSendFees: Readonly<Record<ShipTier, number>>,
  savedTable: PriceTable,
  body: CarrierPricingBody,
): boolean {
  const pairs: Pair[] = [];
  for (const [tier, fee] of Object.entries(body.send_fees ?? {}) as [ShipTier, number][]) {
    pairs.push({ savedKrw: savedSendFees[tier], nextKrw: fee });
  }
  for (const row of body.prices ?? []) pairs.push({ savedKrw: savedTable[row.tier].priceKrw, nextKrw: row.price_krw });
  return anyRaised(pairs);
}
