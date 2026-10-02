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

/**
 * 성공 주소로 돌아온 결제를 승인한다.
 * requesterId: 서버가 확인한 로그인 사용자(INV-L2). 그 팬이 등록한 결제만 처리한다 — 남의 결제는 없는 결제와 같다(INV-L3).
 */
export async function confirmPayment(deps: CheckoutDeps, requesterId: string | null, ret: SuccessReturn): Promise<ConfirmOutcome> {
  const found = await deps.store.find(ret.orderId);
  const record = found && requesterId !== null && found.fanId === requesterId ? found : null;
  if (!record) return { ok: false, reason: "no_pending_payment" };

  // INV-M5: 이미 끝난 결제는 승인 API 를 다시 부르지 않고 처음 결과를 돌려준다.
  if (record.status === "done") return { ok: true, orderId: record.orderId, orderNo: record.orderNo };
  if (record.status === "confirming") return { ok: false, reason: "in_progress" };
  if (record.status === "failed") return { ok: false, reason: "not_approved" };

  // INV-M2: 승인 API 를 부르기 전에 대조한다. 금액이 다르면 결제 대기를 실패로 닫는다.
  // 꼴이 잘못된 입력(빈 결제 키 등)은 거부만 한다 — 잘못된 요청 한 번으로 정상 결제가 막히지 않게.
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
    // 결과를 모른다(시간 초과·연결 끊김) — 토스에서는 승인됐을 수 있으므로 실패로 닫지 않고 승인 중으로 남긴다.
    // 같은 멱등 키로 다시 확인해 확정하는 경로는 BACKLOG(「결과를 모르는 결제 확정」).
    return { ok: false, reason: "in_progress" };
  }

  // INV-M3: DONE + orderId·금액 일치일 때만 완료.
  if (!evaluateConfirmResponse(response, record).done) {
    await deps.store.settle(check.orderId, { status: "failed" });
    return { ok: false, reason: "not_approved" };
  }
  const changed = await deps.store.settle(check.orderId, {
    status: "done",
    paymentKey: check.paymentKey,
    approvalRequest: await draftApprovalRequest(record),
  });
  if (!changed) {
    // 다른 처리가 먼저 반영했다 — 기록을 다시 읽어 그 결과를 따른다.
    const now = await deps.store.find(check.orderId);
    return now?.status === "done" ? { ok: true, orderId: now.orderId, orderNo: now.orderNo } : { ok: false, reason: "in_progress" };
  }
  return { ok: true, orderId: check.orderId, orderNo: record.orderNo };
}
