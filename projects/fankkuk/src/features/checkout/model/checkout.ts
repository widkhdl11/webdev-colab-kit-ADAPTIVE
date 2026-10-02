import { buildSigningPayload } from "@/entities/order/model/signing-payload";
import type { ApprovalRequestDraft, PaymentStore, StoredPayment } from "@/entities/payment/api/payment-store";
import { checkSuccessReturn, evaluateConfirmResponse, type SuccessReturn } from "@/entities/payment/model/confirm";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 결제 승인. 결제 대기는 선물 등록(features/gift-register registerGift)이 만든다.

export type CheckoutDeps = { store: PaymentStore; toss: TossPaymentsClient };

export type ConfirmOutcome =
  | { ok: true; orderId: string; orderNo: string }
  | {
      ok: false;
      reason: "no_pending_payment" | "amount_mismatch" | "order_mismatch" | "bad_input" | "in_progress" | "not_approved";
    };

const ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `apr_${Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("")}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** INV-M6·INV-S1: 결제가 끝날 때 만드는 승인 요청. 원문에는 팬 닉네임 대신 해시만 들어간다. */
async function draftApprovalRequest(record: StoredPayment): Promise<ApprovalRequestDraft> {
  const requestId = newRequestId();
  const requestedAt = new Date().toISOString();
  const payload = buildSigningPayload({
    requestId,
    orderNo: record.orderNo,
    requestedAt,
    fanNicknameHash: await sha256Hex(record.fanNickname),
  });
  return { requestId, payload, requestedAt };
}

/** 성공 주소로 돌아온 결제를 승인한다. */
export async function confirmPayment(deps: CheckoutDeps, ret: SuccessReturn): Promise<ConfirmOutcome> {
  const record = await deps.store.find(ret.orderId);

  // INV-M5: 이미 끝난 결제는 승인 API 를 다시 부르지 않고 처음 결과를 돌려준다.
  if (record?.status === "done") return { ok: true, orderId: record.orderId, orderNo: record.orderNo };
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
  await deps.store.settle(check.orderId, {
    status: "done",
    paymentKey: check.paymentKey,
    approvalRequest: await draftApprovalRequest(record!),
  });
  return { ok: true, orderId: check.orderId, orderNo: record!.orderNo };
}
