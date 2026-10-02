import { z } from "zod";

export type PendingPayment = {
  orderId: string;
  /** 서버가 계산해 저장한 금액 (INV-M1) */
  amountKrw: number;
  status: "pending" | "confirming" | "done" | "failed";
};

/** 성공 주소로 돌아온 쿼리 값. 대조용일 뿐 믿지 않는다. */
export type SuccessReturn = { orderId: string; amount: string; paymentKey: string };

export type SuccessCheck =
  | { ok: true; paymentKey: string; orderId: string; amountKrw: number }
  | { ok: false; reason: "no_pending_payment" | "already_settled" | "order_mismatch" | "amount_mismatch" | "bad_input" };

// 앞자리 0·지수·소수점·단위 글자를 허용하지 않는다 — 같은 값을 여러 꼴로 쓸 수 있으면 대조가 느슨해진다.
const AMOUNT_PATTERN = /^(0|[1-9][0-9]{0,9})$/;

/** INV-M2: 승인 API 를 부르기 전에 성공 주소의 값과 결제 대기 기록을 대조한다. */
export function checkSuccessReturn(ret: SuccessReturn, pending: PendingPayment | null): SuccessCheck {
  if (!pending) return { ok: false, reason: "no_pending_payment" };
  // INV-M5: 이미 끝난 결제 대기에는 승인 API 를 다시 부르지 않는다.
  if (pending.status !== "pending") return { ok: false, reason: "already_settled" };
  if (ret.paymentKey === "") return { ok: false, reason: "bad_input" };
  if (ret.orderId !== pending.orderId) return { ok: false, reason: "order_mismatch" };
  // 꼴이 아닌 금액은 입력 오류(bad_input), 꼴은 맞는데 다른 금액만 금액 불일치(amount_mismatch) — 불일치만 결제 대기를 닫는다
  if (!AMOUNT_PATTERN.test(ret.amount)) return { ok: false, reason: "bad_input" };
  if (Number(ret.amount) !== pending.amountKrw) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, paymentKey: ret.paymentKey, orderId: pending.orderId, amountKrw: pending.amountKrw };
}

const confirmResponseSchema = z.object({
  status: z.string(),
  orderId: z.string(),
  totalAmount: z.number(),
});

/** INV-M3: 승인 응답이 DONE 이고 orderId·금액이 기록과 같을 때만 결제 완료다. */
export function evaluateConfirmResponse(response: unknown, pending: PendingPayment): { done: boolean } {
  const parsed = confirmResponseSchema.safeParse(response);
  if (!parsed.success) return { done: false };
  const r = parsed.data;
  return { done: r.status === "DONE" && r.orderId === pending.orderId && r.totalAmount === pending.amountKrw };
}
