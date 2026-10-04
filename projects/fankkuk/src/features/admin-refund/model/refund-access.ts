import type { RefundStatus } from "@/entities/payment/model/payment-rows";

// 환불 버튼을 누가 어느 줄에서 볼 수 있나 (admin-console INV-K2·K7, design-rules 8절 — 대표만 하는 동작은 직원에게 버튼 자체가 없다).

/** INV-K2·K7: 환불 버튼은 대표에게만, 환불 대기·실패 줄에만. 판정은 DB 가 다시 한다. */
export function canRefund(access: "staff" | "owner", status: RefundStatus): boolean {
  return access === "owner" && (status === "due" || status === "failed");
}
