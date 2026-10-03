import { checkSuccessReturn, evaluateConfirmResponse, type PendingPayment, type SuccessReturn } from "@/entities/payment/model/confirm";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 역조공 결제 확정. 팬 선물 결제(features/checkout)와 같은 대조·한 번만 확정 규칙(payment INV-M2·M3·M5)을 따른다.
// 다른 점: 승인 요청을 만들지 않는다 — 결제 완료 시각이 팬의 받기 기한(168시간)의 시작이다(reverse-gift INV-R10).

export type RevgiftPayment = PendingPayment & { senderId: string };

export interface RevgiftPaymentStore {
  find(orderId: string): Promise<RevgiftPayment | null>;
  /** 결제 대기 → 승인 중. 한 요청만 true. */
  claim(orderId: string): Promise<boolean>;
  /** 이번 호출이 기록을 바꿨는지. 이미 끝난 결제면 false. */
  settle(orderId: string, outcome: { status: "done"; paymentKey: string } | { status: "failed" }): Promise<boolean>;
}

export type RevgiftConfirmOutcome =
  | { ok: true }
  | { ok: false; reason: "no_pending_payment" | "amount_mismatch" | "order_mismatch" | "bad_input" | "in_progress" | "not_approved" };

/** requesterId: 서버가 확인한 로그인 사용자. 보낸 크리에이터의 결제만 처리한다 — 남의 결제는 없는 결제와 같다. */
export async function confirmRevgiftPayment(
  deps: { store: RevgiftPaymentStore; toss: TossPaymentsClient },
  requesterId: string | null,
  ret: SuccessReturn,
): Promise<RevgiftConfirmOutcome> {
  const found = await deps.store.find(ret.orderId);
  const record = found && requesterId !== null && found.senderId === requesterId ? found : null;
  if (!record) return { ok: false, reason: "no_pending_payment" };

  if (record.status === "done") return { ok: true };
  if (record.status === "confirming") return { ok: false, reason: "in_progress" };
  if (record.status === "failed") return { ok: false, reason: "not_approved" };

  // INV-M2: 승인 API 를 부르기 전에 대조한다. 금액이 다르면 결제 대기를 실패로 닫는다.
  const check = checkSuccessReturn(ret, record);
  if (!check.ok) {
    if (check.reason === "amount_mismatch") await deps.store.settle(record.orderId, { status: "failed" });
    return { ok: false, reason: check.reason === "already_settled" ? "in_progress" : check.reason };
  }

  // INV-M5: 승인 API 를 부를 권리는 한 요청만 얻는다.
  if (!(await deps.store.claim(check.orderId))) return { ok: false, reason: "in_progress" };

  let response: unknown;
  try {
    response = await deps.toss.confirm({
      paymentKey: check.paymentKey,
      orderId: check.orderId,
      amount: check.amountKrw,
      idempotencyKey: `confirm-${check.orderId}`,
    });
  } catch {
    // 결과를 모른다 — 토스에서는 승인됐을 수 있으므로 실패로 닫지 않고 승인 중으로 남긴다(팬 선물과 같은 처리).
    return { ok: false, reason: "in_progress" };
  }

  // INV-M3: DONE + orderId·금액 일치일 때만 완료.
  if (!evaluateConfirmResponse(response, record).done) {
    await deps.store.settle(check.orderId, { status: "failed" });
    return { ok: false, reason: "not_approved" };
  }
  const changed = await deps.store.settle(check.orderId, { status: "done", paymentKey: check.paymentKey });
  if (!changed) {
    const now = await deps.store.find(check.orderId);
    return now?.status === "done" ? { ok: true } : { ok: false, reason: "in_progress" };
  }
  return { ok: true };
}
