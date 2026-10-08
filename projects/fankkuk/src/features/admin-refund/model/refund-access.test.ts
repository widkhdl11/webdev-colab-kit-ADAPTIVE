import { describe, expect, it } from "vitest";
import { canRefund, canRefundShare } from "./refund-access";

describe("INV-K2 · INV-K7: 환불 버튼은 대표에게만, 대기·실패 줄에만", () => {
  it("대표는 대기·실패 줄에서 누를 수 있다", () => {
    expect(canRefund("owner", "due", false)).toBe(true);
    expect(canRefund("owner", "failed", false)).toBe(true);
  });

  it("(실패경로) 대표라도 처리 중·완료·대상 아님 줄에는 버튼이 없다", () => {
    for (const s of ["requesting", "done", "none"] as const) expect(canRefund("owner", s, false)).toBe(false);
  });

  it("INV-K2 (실패경로): 직원에게는 어느 줄에도 버튼이 없다", () => {
    for (const s of ["due", "failed", "requesting", "done", "none"] as const) expect(canRefund("staff", s, false)).toBe(false);
  });
});

describe("역조공 몫 환불 버튼 (reverse-gift INV-R11, office-workflow INV-W3·W6)", () => {
  it("INV-W6: 대표는 팬이 받지 않은(거절·기한 지남) 몫에서, 아직 환불 전이거나 실패한 줄만 누른다", () => {
    expect(canRefundShare("owner", { reply: "declined", refundStatus: null })).toBe(true);
    expect(canRefundShare("owner", { reply: "expired", refundStatus: "failed" })).toBe(true);
  });

  it("INV-W3 (실패경로): 기다리는 중·받은 몫, 처리 중·완료 몫, 직원에게는 버튼이 없다", () => {
    expect(canRefundShare("owner", { reply: "waiting", refundStatus: null })).toBe(false);
    expect(canRefundShare("owner", { reply: "accepted", refundStatus: null })).toBe(false);
    expect(canRefundShare("owner", { reply: "declined", refundStatus: "requesting" })).toBe(false);
    expect(canRefundShare("owner", { reply: "expired", refundStatus: "done" })).toBe(false);
    expect(canRefundShare("staff", { reply: "declined", refundStatus: null })).toBe(false);
  });
});

describe("INV-M19: 결제사 기록과 달라 확인 필요인 줄", () => {
  it("INV-M19 (S19d, 실패경로): 확인 필요 줄은 결제가 끝나지 않아 대표에게도 환불 버튼이 없다", () => {
    for (const s of ["due", "failed", "requesting", "done", "none"] as const) {
      expect(canRefund("owner", s, true)).toBe(false);
      expect(canRefund("staff", s, true)).toBe(false);
    }
  });
});
