import { describe, expect, it } from "vitest";
import { TIER_PRICE_KRW, TIER_SHIPPING_COST_KRW } from "../config/tier-pricing";
import { chargeLines, computeCharge, parseChargeBreakdown } from "./charge";

describe("결제 금액 — 상자별 구간 요금 (INV-M1, INV-M7)", () => {
  it("INV-M1: 구간 요금은 소형 6,900원·중형 8,900원 (사용자 결정 d7)", () => {
    expect(TIER_PRICE_KRW).toEqual({ small: 6900, medium: 8900 });
  });

  it("INV-M1 (S1): 소형 2·중형 1 이면 22,700원", () => {
    expect(computeCharge({ boxes: ["small", "small", "medium"] }).totalKrw).toBe(22700);
  });

  it("INV-M1 (S1b, 실패경로): 브라우저가 금액을 같이 보내도 계산에 쓰이지 않는다", () => {
    const fromBrowser = { boxes: ["small"], totalKrw: 100 } as never;
    expect(computeCharge(fromBrowser).totalKrw).toBe(6900);
  });

  it("INV-M1 (S1c, 실패경로): 상자 0개·중형 초과·모르는 구간이면 금액을 만들지 않는다", () => {
    expect(() => computeCharge({ boxes: [] })).toThrow();
    expect(() => computeCharge({ boxes: ["oversize"] })).toThrow();
    expect(() => computeCharge({ boxes: ["small", "large"] })).toThrow();
  });

  it("INV-M7 (S7): 기록은 배송비 칸 = 구간 택배 원가, 서비스료 칸 = 나머지, 합은 결제 금액", () => {
    const c = computeCharge({ boxes: ["small", "medium"] });
    expect(c.shippingFeeKrw).toBe(TIER_SHIPPING_COST_KRW.small + TIER_SHIPPING_COST_KRW.medium);
    expect(c.serviceFeeKrw).toBe(6900 + 8900 - c.shippingFeeKrw);
    expect(c.goodsKrw).toBe(0);
    expect(parseChargeBreakdown(c)).toEqual(c);
  });

  it("INV-M7: 택배 원가 설정은 구간 요금보다 작다 — 크면 서비스료 칸이 음수가 된다", () => {
    for (const tier of ["small", "medium"] as const) {
      expect(TIER_SHIPPING_COST_KRW[tier]).toBeLessThan(TIER_PRICE_KRW[tier]);
    }
  });

  it("INV-M7 (S7b, 실패경로): 세 칸의 합이 결제 금액과 다른 기록은 거부된다", () => {
    expect(parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 2900, shippingFeeKrw: 4000, totalKrw: 9500 })).toBeNull();
    expect(parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 2900, totalKrw: 2900 })).toBeNull();
  });

  it("INV-M7 (실패경로): 정해진 세 칸 밖의 금액 칸이 섞인 기록은 거부된다", () => {
    expect(
      parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 2900, shippingFeeKrw: 4000, totalKrw: 6900, discountKrw: 6900 }),
    ).toBeNull();
  });
});

describe("chargeLines — 결제 화면의 「상자 수 × 구간 요금」 줄", () => {
  it("구간마다 한 줄, 소형 먼저, 0개 구간은 없다", () => {
    expect(chargeLines(["medium", "small", "small"])).toEqual([
      { tier: "small", count: 2, unitKrw: 6900, subtotalKrw: 13800 },
      { tier: "medium", count: 1, unitKrw: 8900, subtotalKrw: 8900 },
    ]);
    expect(chargeLines(["medium"])).toEqual([{ tier: "medium", count: 1, unitKrw: 8900, subtotalKrw: 8900 }]);
  });

  it("줄의 합은 결제 금액과 같다 — 화면과 결제가 어긋나지 않는다", () => {
    const boxes = ["small", "medium", "medium"];
    const sum = chargeLines(boxes).reduce((a, l) => a + l.subtotalKrw, 0);
    expect(sum).toBe(computeCharge({ boxes }).totalKrw);
  });
});
