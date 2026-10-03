import { describe, expect, it } from "vitest";
import { TIER_INSPECTION_FEE_KRW, TIER_PRICE_KRW, TIER_SHIPPING_COST_KRW } from "../config/tier-pricing";
import { chargeLines, computeCharge, computeRevgiftCharge, parseChargeBreakdown, REVGIFT_TIER_PRICE_KRW } from "./charge";

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

  it("INV-M7: 검수비는 소형 1,500원·중형 2,000원 (사용자 결정 2026-10-03)", () => {
    expect(TIER_INSPECTION_FEE_KRW).toEqual({ small: 1500, medium: 2000 });
  });

  it("INV-M7 (S7): 기록은 배송비 칸 = 구간 택배 원가, 검수비 칸 = 구간 검수비, 기본 서비스료 칸 = 나머지, 합은 결제 금액", () => {
    const c = computeCharge({ boxes: ["small", "medium"] });
    expect(c.shippingFeeKrw).toBe(TIER_SHIPPING_COST_KRW.small + TIER_SHIPPING_COST_KRW.medium);
    expect(c.inspectionFeeKrw).toBe(1500 + 2000);
    expect(c.serviceFeeKrw).toBe(6900 + 8900 - c.shippingFeeKrw - c.inspectionFeeKrw);
    expect(c.goodsKrw).toBe(0);
    expect(parseChargeBreakdown(c)).toEqual(c);
  });

  it("INV-M7: 택배 원가 + 검수비는 구간 요금을 넘지 않는다 — 넘으면 기본 서비스료 칸이 음수가 된다", () => {
    for (const tier of ["small", "medium"] as const) {
      expect(TIER_SHIPPING_COST_KRW[tier] + TIER_INSPECTION_FEE_KRW[tier]).toBeLessThanOrEqual(TIER_PRICE_KRW[tier]);
    }
  });

  it("INV-M7 (S7b, 실패경로): 네 칸의 합이 결제 금액과 다른 기록은 거부된다", () => {
    expect(parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 1400, inspectionFeeKrw: 1500, shippingFeeKrw: 4000, totalKrw: 9500 })).toBeNull();
    // 검수비 칸이 빠진 옛 세 칸 기록도 받지 않는다 — 검수비가 기본 서비스료에 섞인다
    expect(parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 2900, shippingFeeKrw: 4000, totalKrw: 6900 })).toBeNull();
  });

  it("INV-M7 (실패경로): 정해진 네 칸 밖의 금액 칸이 섞인 기록은 거부된다", () => {
    expect(
      parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 1400, inspectionFeeKrw: 1500, shippingFeeKrw: 4000, totalKrw: 6900, discountKrw: 6900 }),
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

describe("역조공 요금 — 팬 선물 요금에서 검수비를 뺀다 (INV-R3)", () => {
  it("INV-R3: 역조공 상자 요금은 소형 5,400원·중형 6,900원", () => {
    expect(REVGIFT_TIER_PRICE_KRW).toEqual({ small: 5400, medium: 6900 });
    for (const tier of ["small", "medium"] as const) {
      expect(REVGIFT_TIER_PRICE_KRW[tier]).toBe(TIER_PRICE_KRW[tier] - TIER_INSPECTION_FEE_KRW[tier]);
    }
  });

  it("INV-R3 (S3): 소형 둘·중형 하나면 17,700원, 검수비 칸은 0, 기본 서비스료·배송비는 팬 선물과 같다", () => {
    const r = computeRevgiftCharge({ boxes: ["small", "small", "medium"] });
    const fan = computeCharge({ boxes: ["small", "small", "medium"] });
    expect(r.totalKrw).toBe(5400 * 2 + 6900);
    expect(r.inspectionFeeKrw).toBe(0);
    expect(r.shippingFeeKrw).toBe(fan.shippingFeeKrw);
    expect(r.serviceFeeKrw).toBe(fan.serviceFeeKrw);
    expect(parseChargeBreakdown(r)).toEqual(r);
  });

  it("INV-R3 (S3d, 실패경로): 브라우저가 보낸 금액 칸은 쓰이지 않고, 상자 0개·중형 초과는 금액을 만들지 않는다", () => {
    expect(computeRevgiftCharge({ boxes: ["small"], totalKrw: 1 } as never).totalKrw).toBe(5400);
    expect(() => computeRevgiftCharge({ boxes: [] })).toThrow();
    expect(() => computeRevgiftCharge({ boxes: ["oversize"] })).toThrow();
  });
});
