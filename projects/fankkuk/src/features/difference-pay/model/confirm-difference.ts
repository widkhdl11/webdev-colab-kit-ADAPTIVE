import type { PendingPayment, SuccessReturn } from "@/entities/payment/model/confirm";
import { runConfirmFlow, type ConfirmFailure } from "@/entities/payment/model/confirm-flow";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 차액 결제 확정 (payment INV-M2·M3·M5·M13). 첫 결제(features/checkout)와 같은 대조·한 번만 확정 흐름을 쓴다.
// 다른 점 둘: 결제 주인은 그 주문을 보낸 사람이다(INV-L3). 승인 권리는 기한(요청 + 168시간) 전이고 7일 처리가 닫지 않은 차액만
// 얻는다 — DB 승인 권리 함수가 7일 처리와 같은 줄을 조건부로 갱신해 둘 중 하나만 반영한다(INV-M13·office-workflow INV-W6).
// 완료로 기록할 때 같이 만드는 것은 없다 — 미납 차액이 사라지면 출고 조건(INV-M12)이 저절로 풀린다.

export type DifferencePayment = PendingPayment & { orderNo: string; senderId: string };

export interface DifferencePaymentStore {
  find(tossOrderId: string): Promise<DifferencePayment | null>;
  /** 결제 대기 → 승인 중. 한 요청만, 기한 전 차액만 true. */
  claim(tossOrderId: string): Promise<boolean>;
  /** 이번 호출이 기록을 바꿨는지. 이미 끝난 결제면 false. */
  settle(tossOrderId: string, outcome: { status: "done"; paymentKey: string } | { status: "failed" }): Promise<boolean>;
}

/** closed: 승인 권리를 못 얻었는데 기록이 여전히 결제 대기다 — 기한이 지났거나 상자가 돌려보내는 쪽으로 갔다(INV-M13). */
export type DifferenceConfirmOutcome = { ok: true; orderNo: string } | { ok: false; reason: ConfirmFailure | "closed" };

/** requesterId: 서버가 확인한 로그인 사용자. 그 주문을 보낸 사람의 차액만 처리한다 — 남의 차액은 없는 결제와 같다. */
export async function confirmDifferencePayment(
  deps: { store: DifferencePaymentStore; toss: TossPaymentsClient },
  requesterId: string | null,
  ret: SuccessReturn,
): Promise<DifferenceConfirmOutcome> {
  const r = await runConfirmFlow<DifferencePayment>(
    {
      find: (id) => deps.store.find(id),
      claim: (id) => deps.store.claim(id),
      settleFailed: (id) => deps.store.settle(id, { status: "failed" }),
      settleDone: (record, paymentKey) => deps.store.settle(record.orderId, { status: "done", paymentKey }),
      toss: deps.toss,
    },
    (record) => requesterId !== null && record.senderId === requesterId,
    ret,
  );
  if (r.ok) return { ok: true, orderNo: r.record.orderNo };
  // 「처리 중」은 다른 요청이 승인 중이거나(기록이 승인 중·완료) 승인 권리를 거부당한 경우(기록이 그대로 결제 대기)다.
  // 결제 대기로 남아 있으면 기한·상자 상태 때문에 거부된 것이므로 「확인 중」이 아니라 「낼 수 없음」으로 알린다.
  if (r.reason === "in_progress" && (await deps.store.find(ret.orderId))?.status === "pending") return { ok: false, reason: "closed" };
  return r;
}
