import { describe, expect, it } from "vitest";
import type { TossLookup, TossPaymentStatus } from "@/shared/api/toss-payments/client";
import { judgeReconcile, NOT_FOUND_FAIL_AFTER_MINUTES } from "./reconcile";

// 결과를 모르는 결제 확정의 판정 (payment INV-M19). 결제사 결제 조회 결과 + 기록 → 완료·실패·그대로·확인 필요.

const NOW = new Date("2026-10-08T03:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const record = (m = 11) => ({ orderId: "pay_x1", amountKrw: 6900, confirmingAt: minutesAgo(m) });
const found = (status: TossPaymentStatus, over: Partial<{ orderId: string; totalAmount: number; paymentKey: string }> = {}): TossLookup => ({
  kind: "found",
  payment: { status, orderId: "pay_x1", totalAmount: 6900, paymentKey: "pk_from_toss", ...over },
});

describe("INV-M19: 조회 결과 판정", () => {
  it("INV-M19 (S19): 승인됨 + 주문번호·금액 일치 → 완료, 결제 키는 조회 응답의 값", () => {
    expect(judgeReconcile(found("DONE"), record(), NOW)).toEqual({ kind: "done", paymentKey: "pk_from_toss" });
  });

  it("INV-M19 (S19d, 실패경로): 승인됨인데 금액이 다르면 완료도 실패도 아닌 확인 필요", () => {
    expect(judgeReconcile(found("DONE", { totalAmount: 100 }), record(), NOW)).toEqual({ kind: "needs_review" });
    expect(judgeReconcile(found("DONE", { totalAmount: 6901 }), record(), NOW)).toEqual({ kind: "needs_review" });
  });

  it("INV-M19 (S19d, 실패경로): 승인됨인데 주문번호가 다르면 확인 필요", () => {
    expect(judgeReconcile(found("DONE", { orderId: "pay_other" }), record(), NOW)).toEqual({ kind: "needs_review" });
  });

  it("INV-M19 (S19b): 승인 실패·만료·취소는 실패로 닫는다", () => {
    for (const s of ["ABORTED", "EXPIRED", "CANCELED"] as const) {
      expect(judgeReconcile(found(s), record(), NOW)).toEqual({ kind: "failed" });
    }
  });

  it("INV-M19 (S19b): 진행 중·대기 상태와 조회 오류는 그대로", () => {
    for (const s of ["READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT"] as const) {
      expect(judgeReconcile(found(s), record(), NOW)).toEqual({ kind: "keep" });
    }
    expect(judgeReconcile({ kind: "error" }, record(60), NOW)).toEqual({ kind: "keep" });
  });

  it("INV-M19 (S19d, 실패경로): 부분 취소(승인 뒤 결제사 쪽에서 일부 취소)는 금액이 같아도 확인 필요", () => {
    expect(judgeReconcile(found("PARTIAL_CANCELED"), record(), NOW)).toEqual({ kind: "needs_review" });
    expect(judgeReconcile(found("PARTIAL_CANCELED", { totalAmount: 100 }), record(), NOW)).toEqual({ kind: "needs_review" });
  });

  it("INV-M19 (S19c, 실패경로): 결제사에 없음 — 20분이면 그대로, 31분이면 실패", () => {
    expect(NOT_FOUND_FAIL_AFTER_MINUTES).toBe(30);
    expect(judgeReconcile({ kind: "not_found" }, record(20), NOW)).toEqual({ kind: "keep" });
    expect(judgeReconcile({ kind: "not_found" }, record(29), NOW)).toEqual({ kind: "keep" });
    expect(judgeReconcile({ kind: "not_found" }, record(31), NOW)).toEqual({ kind: "failed" });
    // 「30분이 지났으면」 = 30분 초과. 정확히 30분은 그대로, 1밀리초라도 넘으면 실패
    expect(judgeReconcile({ kind: "not_found" }, record(30), NOW)).toEqual({ kind: "keep" });
    const justOver = { ...record(30), confirmingAt: new Date(NOW.getTime() - 30 * 60_000 - 1) };
    expect(judgeReconcile({ kind: "not_found" }, justOver, NOW)).toEqual({ kind: "failed" });
  });
});
