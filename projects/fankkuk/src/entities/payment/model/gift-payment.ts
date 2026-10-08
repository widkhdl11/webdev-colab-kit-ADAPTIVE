import { z } from "zod";

// 선물 하나의 결제 금액 — 팬 상세 화면용 (payment INV-M14). DB 읽기 함수 my_gift_payment 의 응답 모양.
// 금액은 결제할 때 저장한 값뿐이다: 첫 결제 금액, 상자마다 등록 순간의 요금, 환불 금액(서버가 정한 값)과 상태.
// 칸 나눔(상품 대금·서비스료·검수비·배송비)은 오지 않는다 — 정해지지 않은 칸이 섞여 오면(strict) 받지 않는다.

const ts = z.string().min(1);
const iso = (v: string) => new Date(v).toISOString();

const schema = z
  .object({
    order_no: z.string().min(1),
    paid_krw: z.number().int().positive(),
    paid_at: ts,
    boxes: z.array(
      z
        .object({
          label: z.string().min(1),
          tier: z.enum(["small", "medium", "large"]),
          amount_krw: z.number().int().positive(),
          // 결제 + 30일이 지나도 오지 않아 닫힌 상자(office-workflow INV-W10) — 그 상자 금액이 환불 대상이다
          missing: z.boolean(),
        })
        .strict(),
    ),
    refunds: z.array(
      z
        .object({
          amount_krw: z.number().int().positive(),
          status: z.enum(["requesting", "done", "failed"]),
          at: ts,
        })
        .strict(),
    ),
  })
  .strict();

export type GiftPaymentBox = { label: string; tier: "small" | "medium" | "large"; amountKrw: number; missing: boolean };
/** 환불 — 처리 중(결제사 결과를 기다리거나 다시 시도할 것)과 완료 둘로 보인다. 실패는 대표가 다시 처리하므로 처리 중이다. */
export type GiftRefund = { amountKrw: number; state: "in_progress" | "done"; at: string };
export type GiftPayment = { orderNo: string; paidKrw: number; paidAt: string; boxes: GiftPaymentBox[]; refunds: GiftRefund[] };

/** null = 남의 주문이거나 결제가 끝나지 않은 주문(함수가 null 을 준다). */
export function parseGiftPayment(data: unknown): GiftPayment | null {
  if (data === null) return null;
  const p = schema.parse(data);
  return {
    orderNo: p.order_no,
    paidKrw: p.paid_krw,
    paidAt: iso(p.paid_at),
    boxes: p.boxes.map((b) => ({ label: b.label, tier: b.tier, amountKrw: b.amount_krw, missing: b.missing })),
    refunds: p.refunds.map((r) => ({ amountKrw: r.amount_krw, state: r.status === "done" ? "done" : "in_progress", at: iso(r.at) })),
  };
}

export type PaymentLine = { tier: GiftPaymentBox["tier"]; unitKrw: number; count: number; missing: boolean };

/** 같은 구간·같은 금액의 상자를 한 줄로 묶는다 — 「소형 상자 6,900원 × 2」. 저장된 금액이 다르거나 닫힌 상자(INV-W10)면 다른 줄이다. */
export function paymentLines(boxes: readonly GiftPaymentBox[]): PaymentLine[] {
  const lines: PaymentLine[] = [];
  for (const b of boxes) {
    const hit = lines.find((l) => l.tier === b.tier && l.unitKrw === b.amountKrw && l.missing === b.missing);
    if (hit) hit.count += 1;
    else lines.push({ tier: b.tier, unitKrw: b.amountKrw, count: 1, missing: b.missing });
  }
  return lines;
}
