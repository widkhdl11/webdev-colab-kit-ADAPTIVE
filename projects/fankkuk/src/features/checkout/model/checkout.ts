import { buildSigningPayload } from "@/entities/order/model/signing-payload";
import type { ApprovalRequestDraft, PaymentStore, StoredPayment } from "@/entities/payment/api/payment-store";
import type { SuccessReturn } from "@/entities/payment/model/confirm";
import { runConfirmFlow, type ConfirmFailure } from "@/entities/payment/model/confirm-flow";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 결제 승인. 결제 대기는 선물 등록(features/gift-register registerGift)이 만든다.

export type CheckoutDeps = { store: PaymentStore; toss: TossPaymentsClient };

export type ConfirmOutcome = { ok: true; orderId: string; orderNo: string } | { ok: false; reason: ConfirmFailure };

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
 * 팬 선물 결제를 완료로 기록한다 — 같은 처리 안에서 주문 등록·승인 요청 생성(INV-M6). 이번 호출이 기록을 바꿨는지 돌려준다.
 * 성공 주소의 확정(confirmPayment)과 결과를 모르는 결제 다시 확인(features/payment-reconcile, INV-M19)이 같이 쓴다.
 */
export async function settleGiftDone(store: PaymentStore, record: StoredPayment, paymentKey: string): Promise<boolean> {
  return store.settle(record.orderId, { status: "done", paymentKey, approvalRequest: await draftApprovalRequest(record) });
}

/**
 * 성공 주소로 돌아온 결제를 승인한다. 공통 흐름은 entities/payment/model/confirm-flow 가 맡는다.
 * requesterId: 서버가 확인한 로그인 사용자(INV-L2). 그 팬이 등록한 결제만 처리한다 — 남의 결제는 없는 결제와 같다(INV-L3).
 * 완료로 기록할 때 같은 처리 안에서 승인 요청을 만든다(INV-M6).
 */
export async function confirmPayment(deps: CheckoutDeps, requesterId: string | null, ret: SuccessReturn): Promise<ConfirmOutcome> {
  const r = await runConfirmFlow<StoredPayment>(
    {
      find: (id) => deps.store.find(id),
      claim: (id) => deps.store.claim(id),
      settleFailed: (id) => deps.store.settle(id, { status: "failed" }),
      settleDone: (record, paymentKey) => settleGiftDone(deps.store, record, paymentKey),
      toss: deps.toss,
    },
    (record) => requesterId !== null && record.fanId === requesterId,
    ret,
  );
  return r.ok ? { ok: true, orderId: r.record.orderId, orderNo: r.record.orderNo } : r;
}
