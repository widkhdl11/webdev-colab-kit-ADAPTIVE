import { describe, expect, it } from "vitest";
import { canMarkManual, canMarkManualShare, canRefund, canRefundShare } from "./refund-access";

describe("INV-K2 · INV-K7: 환불 버튼은 대표에게만, 대기·실패 줄에만", () => {
  it("대표는 대기·실패 줄에서 누를 수 있다", () => {
    expect(canRefund("owner", { status: "due", needsReview: false, retryClosed: false })).toBe(true);
    expect(canRefund("owner", { status: "failed", needsReview: false, retryClosed: false })).toBe(true);
  });

  it("(실패경로) 대표라도 처리 중·완료·대상 아님 줄에는 버튼이 없다", () => {
    for (const s of ["requesting", "done", "none"] as const) expect(canRefund("owner", { status: s, needsReview: false, retryClosed: false })).toBe(false);
  });

  it("INV-K2 (실패경로): 직원에게는 어느 줄에도 버튼이 없다", () => {
    for (const s of ["due", "failed", "requesting", "done", "none"] as const) expect(canRefund("staff", { status: s, needsReview: false, retryClosed: false })).toBe(false);
  });
});

describe("역조공 몫 환불 버튼 (reverse-gift INV-R11, office-workflow INV-W3·W6)", () => {
  it("INV-W6: 대표는 팬이 받지 않은(거절·기한 지남) 몫에서, 아직 환불 전이거나 실패한 줄만 누른다", () => {
    expect(canRefundShare("owner", { reply: "declined", refundStatus: null, retryClosed: false })).toBe(true);
    expect(canRefundShare("owner", { reply: "expired", refundStatus: "failed", retryClosed: false })).toBe(true);
  });

  it("INV-W3 (실패경로): 기다리는 중·받은 몫, 처리 중·완료 몫, 직원에게는 버튼이 없다", () => {
    expect(canRefundShare("owner", { reply: "waiting", refundStatus: null, retryClosed: false })).toBe(false);
    expect(canRefundShare("owner", { reply: "accepted", refundStatus: null, retryClosed: false })).toBe(false);
    expect(canRefundShare("owner", { reply: "declined", refundStatus: "requesting", retryClosed: false })).toBe(false);
    expect(canRefundShare("owner", { reply: "expired", refundStatus: "done", retryClosed: false })).toBe(false);
    expect(canRefundShare("staff", { reply: "declined", refundStatus: null, retryClosed: false })).toBe(false);
  });
});

describe("INV-M19: 결제사 기록과 달라 확인 필요인 줄", () => {
  it("INV-M19 (S19d, 실패경로): 확인 필요 줄은 결제가 끝나지 않아 대표에게도 환불 버튼이 없다", () => {
    for (const s of ["due", "failed", "requesting", "done", "none"] as const) {
      expect(canRefund("owner", { status: s, needsReview: true, retryClosed: false })).toBe(false);
      expect(canRefund("staff", { status: s, needsReview: true, retryClosed: false })).toBe(false);
    }
  });
});

describe("INV-K7 (S7d·S7e): 「직접 환불함」 버튼은 대표에게만, 실패·처리 중 줄에만 (카드 d126)", () => {
  it("INV-K7 (S7d): 대표는 실패·처리 중 줄에서 누를 수 있다 — 처리 중이 2분 안인지는 DB 가 본다", () => {
    expect(canMarkManual("owner", "failed", false)).toBe(true);
    expect(canMarkManual("owner", "requesting", false)).toBe(true);
    expect(canMarkManualShare("owner", { refundStatus: "failed" })).toBe(true);
    expect(canMarkManualShare("owner", { refundStatus: "requesting" })).toBe(true);
  });

  it("INV-K7 (S7e, 실패경로): 누르기 전(대기)·완료·대상 아님 줄, 확인 필요 줄, 직원에게는 없다", () => {
    for (const s of ["due", "done", "none"] as const) expect(canMarkManual("owner", s, false)).toBe(false);
    for (const s of ["failed", "requesting"] as const) {
      expect(canMarkManual("owner", s, true)).toBe(false);
      expect(canMarkManual("staff", s, false)).toBe(false);
      expect(canMarkManualShare("staff", { refundStatus: s })).toBe(false);
    }
    expect(canMarkManualShare("owner", { refundStatus: null })).toBe(false);
    expect(canMarkManualShare("owner", { refundStatus: "done" })).toBe(false);
  });
});

describe("INV-K7 (S7f): 처음 누른 지 14일이 지나 다시 시도가 막힌 줄에는 「직접 환불함」만 (카드 d126)", () => {
  it("INV-K7 (S7f, 실패경로): 14일이 지난 실패 줄에는 「다시 시도」가 없다", () => {
    expect(canRefund("owner", { status: "failed", needsReview: false, retryClosed: true })).toBe(false);
    expect(canRefundShare("owner", { reply: "declined", refundStatus: "failed", retryClosed: true })).toBe(false);
  });

  it("INV-K7 (S7f): 그 줄에도 「직접 환불함」은 그대로 보인다", () => {
    expect(canMarkManual("owner", "failed", false)).toBe(true);
    expect(canMarkManualShare("owner", { refundStatus: "failed" })).toBe(true);
  });
});
