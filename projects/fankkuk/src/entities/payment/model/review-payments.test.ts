import { describe, expect, it } from "vitest";
import { canCancelReview, reviewPaymentsFrom } from "./review-payments";

const ROW = {
  source: "initial",
  toss_order_id: "pay_x1",
  order_no: "FC-7K3M9",
  payer_nickname: "별빛",
  amount_krw: 6900,
  balance_krw: 5000,
  review_at: "2026-10-10T03:00:00Z",
  cancel_status: "none",
  cancel_error: null,
  cancel_attempts: 0,
  cancel_requested_at: null,
};

describe("INV-M20: 확인 필요 결제 목록", () => {
  it("INV-M20: DB 줄을 화면 이름으로 옮긴다", () => {
    expect(reviewPaymentsFrom([ROW])).toEqual([
      {
        source: "initial",
        tossOrderId: "pay_x1",
        orderNo: "FC-7K3M9",
        payerNickname: "별빛",
        amountKrw: 6900,
        balanceKrw: 5000,
        reviewAt: "2026-10-10T03:00:00Z",
        cancelStatus: "none",
        cancelError: null,
        cancelAttempts: 0,
        cancelRequestedAt: null,
      },
    ]);
  });

  it("INV-M20 (실패경로): 모르는 종류·상태, 0 이하 취소 가능 금액이면 지어내지 않고 null", () => {
    expect(reviewPaymentsFrom([{ ...ROW, source: "box" }])).toBeNull();
    expect(reviewPaymentsFrom([{ ...ROW, cancel_status: "pending" }])).toBeNull();
    expect(reviewPaymentsFrom([{ ...ROW, balance_krw: 0 }])).toBeNull();
    expect(reviewPaymentsFrom(null)).toBeNull();
  });

  it("INV-M20 ②: 금액을 알고 취소가 아직(또는 실패)인 줄은 버튼이 열리고, 완료·금액 모름은 닫힌다", () => {
    const now = new Date("2026-10-10T03:00:00Z");
    expect(canCancelReview({ balanceKrw: 5000, cancelStatus: "none", cancelRequestedAt: null }, now)).toBe(true);
    expect(canCancelReview({ balanceKrw: 5000, cancelStatus: "failed", cancelRequestedAt: "2026-10-10T02:59:30Z" }, now)).toBe(true);
    expect(canCancelReview({ balanceKrw: 5000, cancelStatus: "done", cancelRequestedAt: "2026-10-10T01:00:00Z" }, now)).toBe(false);
    expect(canCancelReview({ balanceKrw: null, cancelStatus: "none", cancelRequestedAt: null }, now)).toBe(false);
  });

  it("INV-M20 ②: 처리 중은 2분 안이면 닫히고, 2분이 지나면 다시 열린다(같은 멱등 키로 다시 확인)", () => {
    const now = new Date("2026-10-10T03:00:00Z");
    expect(canCancelReview({ balanceKrw: 5000, cancelStatus: "requesting", cancelRequestedAt: "2026-10-10T02:58:30Z" }, now)).toBe(false);
    expect(canCancelReview({ balanceKrw: 5000, cancelStatus: "requesting", cancelRequestedAt: "2026-10-10T02:58:00Z" }, now)).toBe(false);
    expect(canCancelReview({ balanceKrw: 5000, cancelStatus: "requesting", cancelRequestedAt: "2026-10-10T02:57:59Z" }, now)).toBe(true);
  });
});
