import { describe, expect, it } from "vitest";
import { computeCharge } from "./charge";
import { refundAmountFor, nextRefund } from "./refund";

const paid = computeCharge({ boxes: ["small"] }); // 6,900원 (배송비 칸 = 소형 택배 원가)
const ship = paid.shippingFeeKrw;

describe("환불 금액 (INV-M8)", () => {
  it.each([
    ["rejected", false, 6900],
    ["expired", false, 6900],
    ["canceled", false, 6900],
  ] as const)("INV-M8 (S8): 입고 전 %s 는 전액 환불", (reason, arrived, expected) => {
    expect(refundAmountFor({ reason, arrived, shipped: false, charge: paid })).toBe(expected);
  });

  it("INV-M8 (S8): 입고 뒤 검수 불합격은 검수비(서비스료)와 반송비(배송비 칸)를 모두 빼 상품 대금 칸만 환불", () => {
    expect(refundAmountFor({ reason: "inspection_failed", arrived: true, shipped: false, charge: paid })).toBe(0);
    const withGoods = { goodsKrw: 10000, serviceFeeKrw: 2900, shippingFeeKrw: 4000, totalKrw: 16900 };
    expect(refundAmountFor({ reason: "inspection_failed", arrived: true, shipped: false, charge: withGoods })).toBe(10000);
  });

  it.each(["rejected", "expired"] as const)("INV-M8 (S8): 입고 뒤 %s 는 반송 택배비(배송비 칸)를 뺀 금액을 환불", (reason) => {
    const refund = refundAmountFor({ reason, arrived: true, shipped: false, charge: paid });
    expect(refund).toBe(paid.totalKrw - ship);
    expect(refund).toBe(paid.serviceFeeKrw + paid.goodsKrw);
  });

  it("INV-M8 (S8): 입고 뒤 팬 취소는 배송비 칸만 환불 — 거절 규칙(반송비 차감)과 섞이지 않는다", () => {
    expect(refundAmountFor({ reason: "canceled", arrived: true, shipped: false, charge: paid })).toBe(ship);
  });

  it("INV-M8 (S8, 실패경로): 상품 대금이 있는 결제의 입고 뒤 거절은 상품 대금도 돌려준다 — 빼는 것은 반송 택배비뿐", () => {
    const withGoods = { goodsKrw: 10000, serviceFeeKrw: 2900, shippingFeeKrw: 4000, totalKrw: 16900 };
    expect(refundAmountFor({ reason: "rejected", arrived: true, shipped: false, charge: withGoods })).toBe(12900);
  });

  it.each(["rejected", "expired", "canceled", "inspection_failed"] as const)(
    "INV-M8 (S8, 실패경로): 출고 뒤에는 %s 라도 환불이 없다",
    (reason) => {
      expect(refundAmountFor({ reason, arrived: true, shipped: true, charge: paid })).toBe(0);
    },
  );

  it("INV-M8 (실패경로): 검수 불합격은 입고 전일 수 없다 — 이상한 조합은 거부한다", () => {
    expect(() => refundAmountFor({ reason: "inspection_failed", arrived: false, shipped: false, charge: paid })).toThrow();
    expect(() => refundAmountFor({ reason: "rejected", arrived: false, shipped: true, charge: paid })).toThrow();
  });
});

describe("차액 미납 반송 환불 (INV-M8)", () => {
  it("INV-M8 (S8): 차액 미납 반송은 배송비 칸만 환불", () => {
    expect(refundAmountFor({ reason: "difference_unpaid", arrived: true, shipped: false, charge: paid })).toBe(ship);
  });

  it("INV-M8 (실패경로): 차액 미납은 입고 전일 수 없다", () => {
    expect(() => refundAmountFor({ reason: "difference_unpaid", arrived: false, shipped: false, charge: paid })).toThrow();
  });
});

describe("환불 합계 상한 (INV-M9)", () => {
  it("INV-M9: 아직 환불한 적 없으면 계산된 금액 그대로 환불한다", () => {
    expect(nextRefund({ paidKrw: 9000, refundedKrw: 0, dueKrw: 9000 })).toEqual({ refundKrw: 9000 });
  });

  it("INV-M9 (S9, 실패경로): 이미 전액 환불된 결제는 더 나가지 않는다", () => {
    expect(nextRefund({ paidKrw: 9000, refundedKrw: 9000, dueKrw: 9000 })).toEqual({ refundKrw: 0 });
  });

  it("INV-M9 (실패경로): 이미 일부 환불됐으면 남은 만큼만 나간다 — 합계가 결제 금액을 넘지 않는다", () => {
    expect(nextRefund({ paidKrw: 9000, refundedKrw: 4000, dueKrw: 9000 })).toEqual({ refundKrw: 5000 });
    expect(nextRefund({ paidKrw: 9000, refundedKrw: 4000, dueKrw: 4000 })).toEqual({ refundKrw: 0 });
  });

  it("INV-M9 (실패경로): 계산된 환불액이 결제 금액보다 커도 결제 금액까지만 나간다", () => {
    expect(nextRefund({ paidKrw: 9000, refundedKrw: 0, dueKrw: 12000 })).toEqual({ refundKrw: 9000 });
  });

  it("INV-M9 (실패경로): 기록이 이미 결제 금액을 넘었으면 0 이고 음수가 되지 않는다", () => {
    expect(nextRefund({ paidKrw: 9000, refundedKrw: 12000, dueKrw: 9000 })).toEqual({ refundKrw: 0 });
  });
});
