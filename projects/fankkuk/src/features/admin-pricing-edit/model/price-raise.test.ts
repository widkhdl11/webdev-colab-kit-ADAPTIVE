import { describe, expect, it } from "vitest";
import type { ShipTier } from "@/entities/payment/model/carrier-pricing";
import type { PriceTable } from "@/entities/payment/model/price-table";
import { raisesBoxServiceFees, raisesCarrierPricing, raisesPriceTable } from "./price-raise";

// 요금을 올리는 저장인지 (ux pages/admin-pricing.md 「요금을 올려 저장할 때 30일 공지 확인 창」).
// 손님이 내는 칸 중 하나라도 저장된 값보다 크면 오름. 같은 값·내림·원가만 바꾼 것은 오름이 아니다.

const TABLE: PriceTable = {
  small: { priceKrw: 7000, carrierCostKrw: 3000, inspectionFeeKrw: 500 },
  medium: { priceKrw: 9000, carrierCostKrw: 4000, inspectionFeeKrw: 500 },
  large: { priceKrw: 12000, carrierCostKrw: 5000, inspectionFeeKrw: 500 },
};
const SEND_FEES: Record<ShipTier, number> = { xsmall: 3000, small: 3500, medium: 4000, large: 5000 };

function tableWith(patch: (t: PriceTable) => PriceTable): PriceTable {
  return patch(structuredClone(TABLE));
}

describe("요금표 — 받는 값만 본다", () => {
  it("받는 값 하나가 오르면 오름", () => {
    expect(raisesPriceTable(TABLE, tableWith((t) => ({ ...t, large: { ...t.large, priceKrw: t.large.priceKrw + 1 } })))).toBe(true);
    expect(raisesPriceTable(TABLE, tableWith((t) => ({ ...t, small: { ...t.small, priceKrw: t.small.priceKrw + 100 } })))).toBe(true);
  });
  it("같은 값은 오름이 아니다(경계)", () => {
    expect(raisesPriceTable(TABLE, tableWith((t) => t))).toBe(false);
  });
  it("내리기만 하면 오름이 아니다", () => {
    expect(raisesPriceTable(TABLE, tableWith((t) => ({ ...t, medium: { ...t.medium, priceKrw: t.medium.priceKrw - 100 } })))).toBe(false);
  });
  it("검수비·택배 원가만 올려도 오름이 아니다", () => {
    expect(
      raisesPriceTable(TABLE, tableWith((t) => ({ ...t, small: { ...t.small, inspectionFeeKrw: 900, carrierCostKrw: 3500 } }))),
    ).toBe(false);
  });
  it("하나는 내리고 하나는 올리면 오름", () => {
    expect(
      raisesPriceTable(
        TABLE,
        tableWith((t) => ({ ...t, small: { ...t.small, priceKrw: t.small.priceKrw - 500 }, medium: { ...t.medium, priceKrw: t.medium.priceKrw + 500 } })),
      ),
    ).toBe(true);
  });
  it("숫자가 아닌 입력은 오름으로 치지 않는다", () => {
    expect(raisesPriceTable(TABLE, tableWith((t) => ({ ...t, small: { ...t.small, priceKrw: Number.NaN } })))).toBe(false);
  });
});

describe("선물함 서비스료 — 정가·초기 둘 다 본다", () => {
  const SAVED = { regularKrw: 1000, earlyKrw: 500 };
  it("정가가 오르면 오름", () => {
    expect(raisesBoxServiceFees(SAVED, { ...SAVED, regularKrw: 1001 })).toBe(true);
  });
  it("초기가 오르면 오름", () => {
    expect(raisesBoxServiceFees(SAVED, { ...SAVED, earlyKrw: 501 })).toBe(true);
  });
  it("같은 값은 오름이 아니다(경계)", () => {
    expect(raisesBoxServiceFees(SAVED, { ...SAVED })).toBe(false);
  });
  it("내리기만 하면 오름이 아니다", () => {
    expect(raisesBoxServiceFees(SAVED, { regularKrw: 900, earlyKrw: 0 })).toBe(false);
  });
});

describe("경로표 양식 — 팬에게 보내기 택배비와 함께 저장하는 받는 값만 본다", () => {
  it("택배비 하나가 오르면 오름", () => {
    expect(raisesCarrierPricing(SEND_FEES, TABLE, { send_fees: { xsmall: SEND_FEES.xsmall + 100 } })).toBe(true);
  });
  it("함께 저장하는 받는 값이 오르면 오름", () => {
    const prices = (["small", "medium", "large"] as const).map((tier) => ({ tier, price_krw: TABLE[tier].priceKrw + (tier === "medium" ? 1 : 0), inspection_fee_krw: 500 }));
    expect(raisesCarrierPricing(SEND_FEES, TABLE, { prices })).toBe(true);
  });
  it("같은 값은 오름이 아니다(경계)", () => {
    const prices = (["small", "medium", "large"] as const).map((tier) => ({ tier, price_krw: TABLE[tier].priceKrw, inspection_fee_krw: 500 }));
    expect(raisesCarrierPricing(SEND_FEES, TABLE, { send_fees: { large: SEND_FEES.large }, prices })).toBe(false);
  });
  it("내리기만 하면 오름이 아니다", () => {
    expect(raisesCarrierPricing(SEND_FEES, TABLE, { send_fees: { small: SEND_FEES.small - 100, large: SEND_FEES.large - 100 } })).toBe(false);
  });
  it("원가·기본 경로만 바꾸면(손님 금액 없음) 오름이 아니다", () => {
    expect(
      raisesCarrierPricing(SEND_FEES, TABLE, { routes: { post_office: { xsmall: 99999, large: 99999 } }, default_route: "agency" }),
    ).toBe(false);
  });
});
