import type { PaymentStore, StoredPayment } from "@/entities/payment/api/payment-store";
import { computeCharge } from "@/entities/payment/model/charge";
import { checkSuccessReturn, evaluateConfirmResponse, type SuccessReturn } from "@/entities/payment/model/confirm";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

export type CheckoutDeps = { store: PaymentStore; toss: TossPaymentsClient; shippingFeeKrw: number };

// 토스 orderId 규칙: 영문·숫자·-·_ 6~64자.
function newPaymentOrderId(): string {
  return `pay_${crypto.randomUUID().replaceAll("-", "")}`;
}

/** 결제 대기를 만든다. 금액은 서버 설정으로만 계산한다(INV-M1). */
export async function startCheckout(deps: CheckoutDeps, input: { orderNo: string }): Promise<StoredPayment> {
  const charge = computeCharge({ shippingFeeKrw: deps.shippingFeeKrw });
  return deps.store.create({ orderId: newPaymentOrderId(), orderNo: input.orderNo, charge });
}

export type ConfirmOutcome =
  | { ok: true; orderId: string }
  | {
      ok: false;
      reason: "no_pending_payment" | "amount_mismatch" | "order_mismatch" | "bad_input" | "in_progress" | "not_approved";
    };

/** 성공 주소로 돌아온 결제를 승인한다. */
export async function confirmPayment(deps: CheckoutDeps, ret: SuccessReturn): Promise<ConfirmOutcome> {
  const record = await deps.store.find(ret.orderId);

  // INV-M5: 이미 끝난 결제는 승인 API 를 다시 부르지 않고 처음 결과를 돌려준다.
  if (record?.status === "done") return { ok: true, orderId: record.orderId };
  if (record?.status === "confirming") return { ok: false, reason: "in_progress" };
  if (record?.status === "failed") return { ok: false, reason: "not_approved" };

  // INV-M2: 승인 API 를 부르기 전에 대조한다. 어긋나면 결제 대기를 실패로 닫는다.
  const check = checkSuccessReturn(ret, record);
  if (!check.ok) {
    if (record) await deps.store.settle(record.orderId, { status: "failed" });
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
    response = null;
  }

  // INV-M3: DONE + orderId·금액 일치일 때만 완료.
  if (!evaluateConfirmResponse(response, record!).done) {
    await deps.store.settle(check.orderId, { status: "failed" });
    return { ok: false, reason: "not_approved" };
  }
  await deps.store.settle(check.orderId, { status: "done", paymentKey: check.paymentKey });
  return { ok: true, orderId: check.orderId };
}
