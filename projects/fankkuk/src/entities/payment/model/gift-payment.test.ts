import { describe, expect, it } from "vitest";
import { parseGiftPayment, paymentLines } from "./gift-payment";

const data = {
  order_no: "FC-T4X7N2",
  paid_krw: 15800,
  paid_at: "2026-10-06T01:00:00+00:00",
  boxes: [
    { label: "FC-T4X7N2-1", tier: "small", amount_krw: 6900 },
    { label: "FC-T4X7N2-2", tier: "medium", amount_krw: 8900 },
  ],
  refunds: [{ amount_krw: 5400, status: "done", at: "2026-10-07T01:00:00+00:00" }],
};

describe("선물 결제 금액 응답 (payment INV-M14)", () => {
  it("INV-M14: 저장된 상자 금액·결제 금액·환불을 화면 모양으로 바꾼다", () => {
    expect(parseGiftPayment(data)).toEqual({
      orderNo: "FC-T4X7N2",
      paidKrw: 15800,
      paidAt: "2026-10-06T01:00:00.000Z",
      boxes: [
        { label: "FC-T4X7N2-1", tier: "small", amountKrw: 6900 },
        { label: "FC-T4X7N2-2", tier: "medium", amountKrw: 8900 },
      ],
      refunds: [{ amountKrw: 5400, state: "done", at: "2026-10-07T01:00:00.000Z" }],
    });
  });

  it("INV-M14: 남의 주문·결제 전 주문은 함수가 null 을 준다 — 그대로 null", () => {
    expect(parseGiftPayment(null)).toBeNull();
  });

  it("INV-M14 (실패경로): 칸 나눔(서비스료·검수비·배송비)이 섞여 오면 받지 않는다", () => {
    expect(() => parseGiftPayment({ ...data, service_fee_krw: 3300 })).toThrow();
    expect(() => parseGiftPayment({ ...data, boxes: [{ ...data.boxes[0], shipping_fee_krw: 4000 }] })).toThrow();
  });

  it("INV-M14 S14c: 처리 중·실패한 환불은 「처리 중」, 완료만 「완료」", () => {
    const p = parseGiftPayment({
      ...data,
      refunds: [
        { amount_krw: 100, status: "requesting", at: "2026-10-07T01:00:00Z" },
        { amount_krw: 200, status: "failed", at: "2026-10-07T01:00:00Z" },
      ],
    });
    expect(p?.refunds.map((r) => r.state)).toEqual(["in_progress", "in_progress"]);
  });

  it("같은 구간·같은 금액은 한 줄로, 저장된 금액이 다르면 다른 줄로 묶는다", () => {
    expect(
      paymentLines([
        { label: "a", tier: "small", amountKrw: 6900 },
        { label: "b", tier: "small", amountKrw: 6900 },
        { label: "c", tier: "small", amountKrw: 7400 },
        { label: "d", tier: "medium", amountKrw: 8900 },
      ]),
    ).toEqual([
      { tier: "small", unitKrw: 6900, count: 2 },
      { tier: "small", unitKrw: 7400, count: 1 },
      { tier: "medium", unitKrw: 8900, count: 1 },
    ]);
  });
});
