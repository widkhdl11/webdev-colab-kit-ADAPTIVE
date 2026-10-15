import { describe, expect, it } from "vitest";
import type { TossLookup, TossPaymentStatus } from "@/shared/api/toss-payments/client";
import { evaluateDepositIssued } from "./confirm";
import { judgeDeposit, type DepositRecord } from "./deposit";

// 무통장 입금 판정 (payment INV-M21~M24). 결제사 조회 결과 + 우리 기록 → 완료·닫기·기한 지남·되돌림·확인 필요·그대로.

const NOW = new Date("2026-10-15T03:00:00Z");
const record = (over: Partial<DepositRecord> = {}): DepositRecord => ({
  orderId: "pay_va1",
  amountKrw: 6900,
  status: "waiting_deposit",
  dueAt: new Date(NOW.getTime() + 60_000),
  ...over,
});
const found = (status: TossPaymentStatus, over: Partial<{ orderId: string; totalAmount: number }> = {}): TossLookup => ({
  kind: "found",
  payment: { status, orderId: "pay_va1", totalAmount: 6900, balanceAmount: 6900, paymentKey: "pk_lookup", ...over },
});

describe("INV-M22: 조회 결과로만 판정", () => {
  it("INV-M22: 입금 대기 + 조회 완료·금액 일치 → 완료, 결제 키는 조회 응답의 값", () => {
    expect(judgeDeposit(found("DONE"), record(), NOW)).toEqual({ kind: "done", paymentKey: "pk_lookup" });
  });
  it("INV-M22 (실패경로): 금액·주문번호가 다른 완료는 완료가 아니라 확인 필요", () => {
    expect(judgeDeposit(found("DONE", { totalAmount: 100 }), record(), NOW)).toEqual({ kind: "review" });
    expect(judgeDeposit(found("DONE", { orderId: "pay_other" }), record(), NOW)).toEqual({ kind: "review" });
  });
  it("INV-M22 (실패경로): 조회 실패는 오류(다시 본다), 결제 없음은 그대로", () => {
    expect(judgeDeposit({ kind: "error" }, record(), NOW)).toEqual({ kind: "error" });
    expect(judgeDeposit({ kind: "not_found" }, record(), NOW)).toEqual({ kind: "keep" });
  });
  it("INV-M22: 이미 완료된 결제에 완료 알림이 다시 와도 바꿀 것이 없다", () => {
    expect(judgeDeposit(found("DONE"), record({ status: "done" }), NOW)).toEqual({ kind: "keep" });
  });
});

describe("INV-M23: 기한", () => {
  it("INV-M23: 기한이 지났고 아직 입금 기다리는 중 → 기한 지남(결제사 취소 뒤 닫기)", () => {
    expect(judgeDeposit(found("WAITING_FOR_DEPOSIT"), record({ dueAt: NOW }), NOW)).toEqual({ kind: "expire" });
  });
  it("INV-M23 (실패경로): 기한 1분 전이면 그대로", () => {
    expect(judgeDeposit(found("WAITING_FOR_DEPOSIT"), record(), NOW)).toEqual({ kind: "keep" });
  });
  it("INV-M23 (실패경로): 기한이 지났어도 조회가 완료면 완료", () => {
    expect(judgeDeposit(found("DONE"), record({ dueAt: new Date(NOW.getTime() - 60_000) }), NOW)).toEqual({ kind: "done", paymentKey: "pk_lookup" });
  });
  it("INV-M23: 결제사에서 이미 취소·만료된 입금 대기는 닫는다, 완료된 결제는 그대로", () => {
    for (const s of ["CANCELED", "EXPIRED", "ABORTED"] as const) {
      expect(judgeDeposit(found(s), record(), NOW)).toEqual({ kind: "close" });
      expect(judgeDeposit(found(s), record({ status: "done" }), NOW)).toEqual({ kind: "keep" });
    }
  });
});

describe("INV-M24: 되돌림", () => {
  it("INV-M24: 완료된 결제의 조회가 「입금 기다리는 중」이면 되돌림", () => {
    expect(judgeDeposit(found("WAITING_FOR_DEPOSIT"), record({ status: "done" }), NOW)).toEqual({ kind: "reverted" });
  });
  it("INV-M24 (실패경로): 입금 대기·그 밖의 결제는 되돌림이 아니다", () => {
    expect(judgeDeposit(found("WAITING_FOR_DEPOSIT"), record({ status: "other", dueAt: null }), NOW)).toEqual({ kind: "keep" });
  });
});

describe("INV-M21: 승인 응답의 입금 대기", () => {
  const va = (over: Record<string, unknown> = {}) => ({
    status: "WAITING_FOR_DEPOSIT",
    orderId: "pay_va1",
    totalAmount: 6900,
    paymentKey: "pk_va",
    secret: "ps_secret",
    virtualAccount: { accountNumber: "X6516490000001", bankCode: "20" },
    ...over,
  });
  it("INV-M21: 「입금 기다리는 중」·주문번호·금액이 같고 계좌·비밀 값이 있으면 입금 대기", () => {
    expect(evaluateDepositIssued(va(), { orderId: "pay_va1", amountKrw: 6900 })).toEqual({
      paymentKey: "pk_va",
      secret: "ps_secret",
      bankCode: "20",
      accountNumber: "X6516490000001",
    });
  });
  it("INV-M21 (실패경로): 금액·주문번호가 다르거나, 상태가 다르거나, 계좌·비밀 값이 없으면 아니다", () => {
    const pending = { orderId: "pay_va1", amountKrw: 6900 };
    expect(evaluateDepositIssued(va({ totalAmount: 100 }), pending)).toBeNull();
    expect(evaluateDepositIssued(va({ orderId: "pay_x" }), pending)).toBeNull();
    expect(evaluateDepositIssued(va({ status: "DONE" }), pending)).toBeNull();
    expect(evaluateDepositIssued(va({ secret: null }), pending)).toBeNull();
    expect(evaluateDepositIssued(va({ virtualAccount: null }), pending)).toBeNull();
  });
});
