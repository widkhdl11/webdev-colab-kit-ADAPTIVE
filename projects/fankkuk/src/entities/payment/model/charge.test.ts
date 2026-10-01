import { describe, expect, it } from "vitest";
import { computeCharge, parseChargeBreakdown, SERVICE_FEE_KRW } from "./charge";

describe("결제 금액 (INV-M1, INV-M7)", () => {
  it("INV-M1 (S1): 배송비 4,000원이면 결제 금액은 9,000원이다", () => {
    expect(computeCharge({ shippingFeeKrw: 4000 })).toEqual({
      goodsKrw: 0,
      serviceFeeKrw: 5000,
      shippingFeeKrw: 4000,
      totalKrw: 9000,
    });
  });

  it("INV-M1: 서비스료는 5,000원 고정이다", () => {
    expect(SERVICE_FEE_KRW).toBe(5000);
    expect(computeCharge({ shippingFeeKrw: 3500 }).totalKrw).toBe(8500);
  });

  it("INV-M1 (S1b, 실패경로): 브라우저가 금액을 같이 보내도 계산에 쓰이지 않는다", () => {
    const fromBrowser = { shippingFeeKrw: 4000, totalKrw: 100, serviceFeeKrw: 0 } as never;
    expect(computeCharge(fromBrowser).totalKrw).toBe(9000);
  });

  it("INV-M1 (실패경로): 배송비 설정이 음수·소수·비정상이면 금액을 만들지 않는다", () => {
    expect(() => computeCharge({ shippingFeeKrw: -1 })).toThrow();
    expect(() => computeCharge({ shippingFeeKrw: 3999.5 })).toThrow();
    expect(() => computeCharge({ shippingFeeKrw: Number.NaN })).toThrow();
  });

  it("INV-M7 (S7): 결제 기록은 세 칸으로 나뉘고 합이 결제 금액과 같다", () => {
    const c = computeCharge({ shippingFeeKrw: 4000 });
    expect(parseChargeBreakdown(c)).toEqual(c);
    expect(c.goodsKrw + c.serviceFeeKrw + c.shippingFeeKrw).toBe(c.totalKrw);
  });

  it("INV-M7 (S7b, 실패경로): 세 칸의 합이 결제 금액과 다른 기록은 거부된다", () => {
    expect(parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 5000, shippingFeeKrw: 4000, totalKrw: 9500 })).toBeNull();
    expect(parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 5000, totalKrw: 5000 })).toBeNull();
  });

  it("INV-M7 (실패경로): 정해진 세 칸 밖의 금액 칸이 섞인 기록은 거부된다", () => {
    expect(
      parseChargeBreakdown({ goodsKrw: 0, serviceFeeKrw: 5000, shippingFeeKrw: 4000, totalKrw: 9000, discountKrw: 9000 }),
    ).toBeNull();
  });
});
