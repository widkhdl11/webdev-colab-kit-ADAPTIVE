import type { ChargeBreakdown } from "./charge";

export type RefundReason = "rejected" | "expired" | "canceled" | "inspection_failed" | "difference_unpaid";

/**
 * INV-M8: 환불 금액은 서버가 주문 상황으로 정한다.
 *   입고 전 거절·반려·취소 → 전액
 *   입고 뒤 거절·7일 자동 반려 → 반송 택배비(배송비 칸)를 뺀 금액 = 서비스료 + 상품 대금 칸 (2026-10-02 사용자 결정)
 *   입고 뒤 검수 불합격(추적 장치 등) → 검수비(서비스료)·반송비(배송비 칸) 모두 차감, 상품 대금 칸만 (2026-10-02 사용자 결정)
 *   입고 뒤 팬 취소·차액 미납 → 배송비 칸만 / 출고 뒤 → 없음
 *   차액 결제도 결제 건마다 같은 표를 따른다.
 */
export function refundAmountFor(input: {
  reason: RefundReason;
  arrived: boolean;
  shipped: boolean;
  charge: ChargeBreakdown;
}): number {
  if (input.shipped && !input.arrived) throw new Error("refund: 입고 없이 출고된 주문은 있을 수 없다");
  if ((input.reason === "inspection_failed" || input.reason === "difference_unpaid") && !input.arrived) {
    throw new Error("refund: 검수 불합격·차액 미납은 입고 뒤에만 생긴다");
  }
  if (input.shipped) return 0;
  if (!input.arrived) return input.charge.totalKrw;
  if (input.reason === "rejected" || input.reason === "expired") return input.charge.totalKrw - input.charge.shippingFeeKrw;
  if (input.reason === "inspection_failed") return input.charge.goodsKrw;
  return input.charge.shippingFeeKrw;
}

/** INV-M9: 이번에 내보낼 환불액. 환불 합계가 결제 금액을 넘지 않는다. */
export function nextRefund(input: { paidKrw: number; refundedKrw: number; dueKrw: number }): { refundKrw: number } {
  const remaining = Math.max(0, input.paidKrw - input.refundedKrw);
  const owed = Math.max(0, input.dueKrw - input.refundedKrw);
  return { refundKrw: Math.min(remaining, owed) };
}
