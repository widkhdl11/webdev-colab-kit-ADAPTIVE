import { judgeDeposit } from "@/entities/payment/model/deposit";
import { fullCancelVerdict } from "@/shared/api/toss-payments/cancel-outcome";
import type { TossLookup, TossPaymentsClient } from "@/shared/api/toss-payments/client";
import type { DepositStore } from "../api/supabase-deposit-store";

// 입금 대기 결제의 예약 확인 (payment INV-M22 놓친 알림 메우기 · INV-M23 기한 지남).
// 결제 다시 확인(INV-M19)과 같은 회차에 돈다 — 대상 목록(DB: 기한 지난 것 먼저, 30분마다) → 결제사 조회 → 판정 → 반영.
// 기한이 지났는데 아직 「입금 기다리는 중」이면 결제사에서 먼저 전액 취소한다(입금 전이라 환불 계좌가 필요 없다) —
// 결제사가 취소를 확인해 준 것만 결제 실패로 닫는다(주문은 결제 전으로 끝남). 그 사이 입금돼 결제사가 거절하면 그대로 두고 다음 회차의 조회가 완료로 반영한다.
// 조회 결과가 완료면 기한이 지났어도 취소하지 않는다.

export type DepositReconcileDeps = {
  store: DepositStore;
  lookup(orderId: string): Promise<TossLookup>;
  cancel: TossPaymentsClient["cancel"];
  settleDone(orderId: string, paymentKey: string): Promise<boolean>;
  now(): Date;
};

export type DepositCounts = { checked: number; done: number; failed: number; review: number; kept: number; errors: number; skipped: number };

const EXPIRE_REASON = "입금 기한 지남";

export async function reconcileDeposits(deps: DepositReconcileDeps, orderNo: string | null, deadlineMs: number): Promise<DepositCounts> {
  const counts: DepositCounts = { checked: 0, done: 0, failed: 0, review: 0, kept: 0, errors: 0, skipped: 0 };
  const targets = await deps.store.listTargets(orderNo);
  for (const t of targets) {
    if (deps.now().getTime() > deadlineMs) {
      counts.skipped += 1;
      continue;
    }
    counts.checked += 1;
    try {
      await deps.store.markChecked(t.orderId);
      const lookup = await deps.lookup(t.orderId);
      const decision = judgeDeposit(lookup, { orderId: t.orderId, amountKrw: t.amountKrw, status: "waiting_deposit", dueAt: t.dueAt }, deps.now());
      if (decision.kind === "error") {
        counts.errors += 1;
        counts.kept += 1;
      } else if (decision.kind === "done") {
        if (await deps.settleDone(t.orderId, decision.paymentKey)) counts.done += 1;
        else counts.kept += 1;
      } else if (decision.kind === "close") {
        if (await deps.store.close(t.orderId)) counts.failed += 1;
        else counts.kept += 1;
      } else if (decision.kind === "expire") {
        let verdict: ReturnType<typeof fullCancelVerdict>;
        try {
          const res = await deps.cancel({ paymentKey: t.paymentKey, cancelReason: EXPIRE_REASON, idempotencyKey: `deposit-expire-${t.orderId}` });
          verdict = fullCancelVerdict(res, t.paymentKey);
        } catch {
          verdict = { kind: "unknown" };
        }
        if (verdict.kind === "ok" && (await deps.store.close(t.orderId))) counts.failed += 1;
        else {
          // 거절(그 사이 입금 등)은 다음 회차의 조회가 정한다. 결과를 모르면 실패로 센다
          if (verdict.kind === "unknown") counts.errors += 1;
          counts.kept += 1;
        }
      } else if (decision.kind === "review") {
        if (await deps.store.markReview(t.orderId)) counts.review += 1;
        else counts.kept += 1;
      } else {
        counts.kept += 1;
      }
    } catch {
      counts.errors += 1;
      counts.kept += 1;
    }
  }
  return counts;
}
