import type { PendingPayment, SuccessReturn } from "@/entities/payment/model/confirm";
import { runConfirmFlow, type ConfirmFailure } from "@/entities/payment/model/confirm-flow";
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

/** 역조공 결제를 완료로 기록한다(몫마다 받는 주소 발급은 DB 가 같은 처리에서). 성공 주소의 확정과 결과를 모르는 결제 다시 확인(INV-M19)이 같이 쓴다. */
export function settleRevgiftDone(store: RevgiftPaymentStore, tossOrderId: string, paymentKey: string): Promise<boolean> {
  return store.settle(tossOrderId, { status: "done", paymentKey });
}

export type RevgiftConfirmOutcome = { ok: true } | { ok: false; reason: ConfirmFailure };

/** requesterId: 서버가 확인한 로그인 사용자. 보낸 크리에이터의 결제만 처리한다 — 남의 결제는 없는 결제와 같다. */
export async function confirmRevgiftPayment(
  deps: { store: RevgiftPaymentStore; toss: TossPaymentsClient },
  requesterId: string | null,
  ret: SuccessReturn,
): Promise<RevgiftConfirmOutcome> {
  const r = await runConfirmFlow<RevgiftPayment>(
    {
      find: (id) => deps.store.find(id),
      claim: (id) => deps.store.claim(id),
      settleFailed: (id) => deps.store.settle(id, { status: "failed" }),
      settleDone: (record, paymentKey) => settleRevgiftDone(deps.store, record.orderId, paymentKey),
      toss: deps.toss,
    },
    (record) => requesterId !== null && record.senderId === requesterId,
    ret,
  );
  return r.ok ? { ok: true } : r;
}
