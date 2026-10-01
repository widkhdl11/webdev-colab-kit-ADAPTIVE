import { describe, expect, it } from "vitest";
import { computeCharge } from "./charge";
import { refundAmountFor, nextRefund } from "./refund";

const paid = computeCharge({ shippingFeeKrw: 4000 }); // 9,000원

describe("환불 금액 (INV-M8)", () => {
  it.each([
    ["rejected", false, 9000],
    ["expired", false, 9000],
    ["canceled", false, 9000],
  ] as const)("INV-M8 (S8): 입고 전 %s 는 전액 환불", (reason, arrived, expected) => {
    expect(refundAmountFor({ reason, arrived, shipped: false, charge: paid })).toBe(expected);
  });

  it("INV-M8 (S8): 입고 뒤 검수 불합격은 배송비만 환불", () => {
    expect(refundAmountFor({ reason: "inspection_failed", arrived: true, shipped: false, charge: paid })).toBe(4000);
  });

  it.each(["rejected", "expired", "canceled"] as const)("INV-M8 (S8): 입고 뒤 %s 는 배송비만 환불", (reason) => {
    expect(refundAmountFor({ reason, arrived: true, shipped: false, charge: paid })).toBe(4000);
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
