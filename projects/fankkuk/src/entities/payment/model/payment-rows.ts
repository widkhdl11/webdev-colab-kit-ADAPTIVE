import { z } from "zod";

// 관리자 「결제·환불」 내역의 줄 (admin-console INV-K1·K7·K8). DB 읽기 함수 admin_payment_rows 의 열네 칸만 받는다 —
// 칸이 하나라도 더 오면(주소·전화 같은) 통째로 받지 않는다.
// 팬 선물은 결제 한 건이 한 줄(첫 결제·차액 결제), 역조공은 몫 하나가 한 줄.
// 도착하지 않음으로 닫힌 팬 선물 상자(office-workflow INV-W10)는 상자 하나가 한 줄 — 상자 환불(payment INV-M8·M9)의 단위다.

export const REFUND_STATUSES = ["none", "due", "requesting", "failed", "done"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export type RefundUnitKind = "gift" | "gift_box" | "revgift";

export type PaymentRow = {
  unitKind: RefundUnitKind;
  unitId: string;
  orderNo: string;
  paymentKind: "initial" | "difference" | "missing_box" | "revgift";
  payerNickname: string;
  amountKrw: number;
  goodsKrw: number;
  serviceFeeKrw: number;
  inspectionFeeKrw: number;
  shippingFeeKrw: number;
  paidAt: string;
  /** amountKrw: 기록된 환불액, 기록 전이면 지금 상태로 계산한 금액. 환불 대상이 아니면 null */
  refund: { status: RefundStatus; amountKrw: number | null; error: string | null };
};

const won = z.number().int().min(0);
const rowShape = z
  .object({
    unit_kind: z.enum(["gift", "gift_box", "revgift"]),
    unit_id: z.uuid(),
    order_no: z.string().min(1),
    payment_kind: z.enum(["initial", "difference", "missing_box", "revgift"]),
    payer_nickname: z.string(),
    amount_krw: won,
    goods_krw: won,
    service_fee_krw: won,
    inspection_fee_krw: won,
    shipping_fee_krw: won,
    paid_at: z.string(),
    refund_status: z.enum(REFUND_STATUSES),
    refund_krw: won.nullable(),
    refund_error: z.string().nullable(),
  })
  .strict();

export function paymentRowsFrom(data: unknown): PaymentRow[] | null {
  const parsed = z.array(rowShape).safeParse(data);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    unitKind: r.unit_kind,
    unitId: r.unit_id,
    orderNo: r.order_no,
    paymentKind: r.payment_kind,
    payerNickname: r.payer_nickname,
    amountKrw: r.amount_krw,
    goodsKrw: r.goods_krw,
    serviceFeeKrw: r.service_fee_krw,
    inspectionFeeKrw: r.inspection_fee_krw,
    shippingFeeKrw: r.shipping_fee_krw,
    paidAt: r.paid_at,
    refund: { status: r.refund_status, amountKrw: r.refund_krw, error: r.refund_error },
  }));
}
