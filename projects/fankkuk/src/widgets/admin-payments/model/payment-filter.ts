import type { PaymentRow, RefundStatus } from "@/entities/payment/model/payment-rows";

// 「결제·환불」 표의 탭·검색 (시안 admin/payments.html). 환불 대기 탭에는 결제사 응답을 기다리는 줄(처리 중)도 같이 둔다.

export const PAYMENT_TABS = [
  { key: "all", label: "전체" },
  { key: "due", label: "환불 대기" },
  { key: "failed", label: "환불 실패" },
  { key: "done", label: "환불 완료" },
  { key: "none", label: "환불 없음" },
] as const;

export type PaymentTab = (typeof PAYMENT_TABS)[number]["key"];

function tabOf(status: RefundStatus): Exclude<PaymentTab, "all"> {
  return status === "requesting" ? "due" : status;
}

export function filterPayments(rows: readonly PaymentRow[], tab: PaymentTab, query: string): PaymentRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (tab === "all" || tabOf(r.refund.status) === tab) &&
      (q === "" || r.orderNo.toLowerCase().includes(q) || r.payerNickname.toLowerCase().includes(q)),
  );
}

export function countByTab(rows: readonly PaymentRow[]): Record<PaymentTab, number> {
  const out: Record<PaymentTab, number> = { all: rows.length, due: 0, failed: 0, done: 0, none: 0 };
  for (const r of rows) out[tabOf(r.refund.status)] += 1;
  return out;
}
