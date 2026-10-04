import { describe, expect, it } from "vitest";
import { paymentRowsFrom } from "./payment-rows";

// 관리자 결제·환불 내역 줄 (admin-console INV-K1·K7·K8). DB 가 준 줄을 정해진 칸으로만 받는다.

const row = {
  unit_kind: "gift",
  unit_id: "00000000-0000-4000-a000-0000000000aa",
  order_no: "FC-ABC123",
  payment_kind: "initial",
  payer_nickname: "별빛",
  amount_krw: 6900,
  goods_krw: 0,
  service_fee_krw: 1400,
  inspection_fee_krw: 1500,
  shipping_fee_krw: 4000,
  paid_at: "2026-10-04T03:20:00+00:00",
  refund_status: "due",
  refund_krw: 6900,
  refund_error: null,
};

describe("INV-K8: 정해진 칸으로만 받는다", () => {
  it("줄을 화면 모양으로 바꾼다", () => {
    expect(paymentRowsFrom([row])).toEqual([
      {
        unitKind: "gift",
        unitId: row.unit_id,
        orderNo: "FC-ABC123",
        paymentKind: "initial",
        payerNickname: "별빛",
        amountKrw: 6900,
        goodsKrw: 0,
        serviceFeeKrw: 1400,
        inspectionFeeKrw: 1500,
        shippingFeeKrw: 4000,
        paidAt: row.paid_at,
        refund: { status: "due", amountKrw: 6900, error: null },
      },
    ]);
  });

  it("INV-K8 (실패경로): 정해진 칸 밖의 칸(주소·전화 등)이 섞이면 받지 않는다", () => {
    expect(paymentRowsFrom([{ ...row, address: "서울시" }])).toBeNull();
  });

  it("(실패경로) 모르는 환불 상태·종류, 칸이 빠진 줄, 배열이 아닌 값은 받지 않는다", () => {
    expect(paymentRowsFrom([{ ...row, refund_status: "maybe" }])).toBeNull();
    expect(paymentRowsFrom([{ ...row, unit_kind: "x" }])).toBeNull();
    const { order_no: _drop, ...missing } = row;
    expect(paymentRowsFrom([missing])).toBeNull();
    expect(paymentRowsFrom(null)).toBeNull();
  });

  it("환불 대상이 아닌 줄은 금액이 없다", () => {
    expect(paymentRowsFrom([{ ...row, refund_status: "none", refund_krw: null }])?.[0]?.refund).toEqual({ status: "none", amountKrw: null, error: null });
  });
});
