import { describe, expect, it } from "vitest";
import type { PaymentRow, RefundStatus } from "@/entities/payment/model/payment-rows";
import { canRefund, countByTab, filterPayments } from "./payment-filter";

function row(orderNo: string, payer: string, status: RefundStatus): PaymentRow {
  return {
    unitKind: "gift",
    unitId: `00000000-0000-4000-a000-0000000000${orderNo.slice(-2)}`,
    orderNo,
    paymentKind: "initial",
    payerNickname: payer,
    amountKrw: 6900,
    goodsKrw: 0,
    serviceFeeKrw: 1400,
    inspectionFeeKrw: 1500,
    shippingFeeKrw: 4000,
    paidAt: "2026-10-04T03:20:00Z",
    refund: { status, amountKrw: status === "none" ? null : 6900, error: null },
  };
}

const rows = [row("FC-AAA01", "별빛", "due"), row("FC-AAA02", "달토끼", "requesting"), row("FC-AAA03", "별빛", "failed"), row("FC-AAA04", "솜사탕", "done"), row("FC-AAA05", "하루", "none")];

describe("결제·환불 내역 거르기", () => {
  it("환불 대기 탭에는 대기와 처리 중이 같이 나온다", () => {
    expect(filterPayments(rows, "due", "").map((r) => r.orderNo)).toEqual(["FC-AAA01", "FC-AAA02"]);
  });

  it("실패·완료·없음 탭은 그 상태만", () => {
    expect(filterPayments(rows, "failed", "").map((r) => r.orderNo)).toEqual(["FC-AAA03"]);
    expect(filterPayments(rows, "done", "").map((r) => r.orderNo)).toEqual(["FC-AAA04"]);
    expect(filterPayments(rows, "none", "").map((r) => r.orderNo)).toEqual(["FC-AAA05"]);
  });

  it("검색은 주문번호·닉네임 어느 쪽이든, 대소문자·앞뒤 빈칸 무시", () => {
    expect(filterPayments(rows, "all", " 별빛 ").map((r) => r.orderNo)).toEqual(["FC-AAA01", "FC-AAA03"]);
    expect(filterPayments(rows, "all", "fc-aaa04").map((r) => r.orderNo)).toEqual(["FC-AAA04"]);
  });

  it("탭별 개수", () => {
    expect(countByTab(rows)).toEqual({ all: 5, due: 2, failed: 1, done: 1, none: 1 });
  });
});

describe("INV-K2 · INV-K7: 환불 버튼은 대표에게만, 대기·실패 줄에만", () => {
  it("대표는 대기·실패 줄에서 누를 수 있다", () => {
    expect(canRefund("owner", "due")).toBe(true);
    expect(canRefund("owner", "failed")).toBe(true);
  });

  it("(실패경로) 대표라도 처리 중·완료·대상 아님 줄에는 버튼이 없다", () => {
    for (const s of ["requesting", "done", "none"] as const) expect(canRefund("owner", s)).toBe(false);
  });

  it("INV-K2 (실패경로): 직원에게는 어느 줄에도 버튼이 없다", () => {
    for (const s of ["due", "failed", "requesting", "done", "none"] as const) expect(canRefund("staff", s)).toBe(false);
  });
});
