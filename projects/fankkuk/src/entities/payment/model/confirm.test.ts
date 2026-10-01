import { describe, expect, it } from "vitest";
import { checkSuccessReturn, evaluateConfirmResponse, type PendingPayment } from "./confirm";

const pending: PendingPayment = { orderId: "FC-7K3M9-p1", amountKrw: 9000, status: "pending" };

describe("성공 주소 대조 (INV-M2)", () => {
  it("INV-M2: orderId·금액이 결제 대기와 같으면 승인 API 를 불러도 된다", () => {
    expect(checkSuccessReturn({ orderId: "FC-7K3M9-p1", amount: "9000", paymentKey: "tgen_abc" }, pending)).toEqual({
      ok: true,
      paymentKey: "tgen_abc",
      orderId: "FC-7K3M9-p1",
      amountKrw: 9000,
    });
  });

  it("INV-M2 (S2, 실패경로): 금액이 다르면 승인 API 를 부르지 않는다", () => {
    expect(checkSuccessReturn({ orderId: "FC-7K3M9-p1", amount: "100", paymentKey: "tgen_abc" }, pending)).toEqual({
      ok: false,
      reason: "amount_mismatch",
    });
  });

  it("INV-M2 (실패경로): 금액이 숫자 꼴이 아니면 거부한다 — '9000원'·'9e3'·'09000' 도 같은 값으로 보지 않는다", () => {
    for (const amount of ["9000원", "9e3", "09000", "9000.0", ""]) {
      expect(checkSuccessReturn({ orderId: "FC-7K3M9-p1", amount, paymentKey: "tgen_abc" }, pending).ok).toBe(false);
    }
  });

  it("INV-M2 (S2b, 실패경로): 결제 대기 기록이 없으면 거부한다", () => {
    expect(checkSuccessReturn({ orderId: "FC-NOPE1-p1", amount: "9000", paymentKey: "tgen_abc" }, null)).toEqual({
      ok: false,
      reason: "no_pending_payment",
    });
  });

  it("INV-M2 (실패경로): orderId 가 기록과 다르면 거부한다", () => {
    expect(checkSuccessReturn({ orderId: "FC-OTHER-p1", amount: "9000", paymentKey: "tgen_abc" }, pending).ok).toBe(false);
  });

  it("INV-M2 (실패경로): paymentKey 가 없으면 거부한다", () => {
    expect(checkSuccessReturn({ orderId: "FC-7K3M9-p1", amount: "9000", paymentKey: "" }, pending).ok).toBe(false);
  });

  it("INV-M5 (S5): 이미 끝난 결제 대기에는 승인 API 를 다시 부르지 않는다", () => {
    expect(
      checkSuccessReturn({ orderId: "FC-7K3M9-p1", amount: "9000", paymentKey: "tgen_abc" }, { ...pending, status: "done" }),
    ).toEqual({ ok: false, reason: "already_settled" });
  });
});

describe("승인 응답 판정 (INV-M3)", () => {
  it("INV-M3 (S3): 상태 DONE 이고 orderId·totalAmount 가 같으면 완료다", () => {
    expect(evaluateConfirmResponse({ status: "DONE", orderId: "FC-7K3M9-p1", totalAmount: 9000 }, pending)).toEqual({
      done: true,
    });
  });

  it.each(["ABORTED", "EXPIRED", "CANCELED", "PARTIAL_CANCELED", "IN_PROGRESS", "READY", "WAITING_FOR_DEPOSIT"])(
    "INV-M3 (S3b, 실패경로): 상태 %s 는 완료로 기록하지 않는다",
    (status) => {
      expect(evaluateConfirmResponse({ status, orderId: "FC-7K3M9-p1", totalAmount: 9000 }, pending).done).toBe(false);
    },
  );

  it("INV-M3 (S3c, 실패경로): DONE 이지만 금액이 다르면 완료가 아니다", () => {
    expect(evaluateConfirmResponse({ status: "DONE", orderId: "FC-7K3M9-p1", totalAmount: 8999 }, pending).done).toBe(false);
  });

  it("INV-M3 (실패경로): DONE 이지만 orderId 가 다르면 완료가 아니다", () => {
    expect(evaluateConfirmResponse({ status: "DONE", orderId: "FC-OTHER-p1", totalAmount: 9000 }, pending).done).toBe(false);
  });

  it("INV-M3 (실패경로): 응답 형식이 깨졌으면 완료가 아니다", () => {
    expect(evaluateConfirmResponse({ status: "DONE" }, pending).done).toBe(false);
    expect(evaluateConfirmResponse(null, pending).done).toBe(false);
  });
});
