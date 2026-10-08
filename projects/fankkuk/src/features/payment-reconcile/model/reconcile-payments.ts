import { judgeReconcile } from "@/entities/payment/model/reconcile";
import type { TossLookup } from "@/shared/api/toss-payments/client";

// 결과를 모르는 결제 다시 확인 (payment INV-M19). 5분 예약 실행과 관리자 「지금 돌리기」가 부른다.
// 대상 목록(DB: 「승인 중」 10분 지난 것, 확인 필요 표시가 없는 것) → 결제사 결제 조회 → 판정(entities) → 반영.
// 반영은 결제 종류마다 기존 확정 흐름의 완료·실패 반영을 그대로 쓴다 — 팬 선물의 완료는 승인 요청 원문을 만들어 넣는 것까지
// (features/checkout settleGiftDone). 반영 함수는 「승인 중인 줄만 바꾸기」라 늦게 돌아온 원래 승인과 겹쳐도 하나만 반영된다(INV-M5).
// 한 줄의 조회·반영이 실패해도 다음 줄을 계속 보고, 실패한 줄 수를 errors 로 센다 — 하나라도 있으면 실행 결과는 실패다.
// 결제사를 부르기 전에 그 줄에 「확인한 시각」을 남긴다 — DB 목록이 그 시각이 오래된 순(없으면 먼저)으로 뽑으므로 그대로 남는 줄이 앞을 차지하지 않는다.
// 시작 뒤 40초가 지나면 남은 줄은 부르지 않고 멈춘다(skipped) — 예약 입구 함수 시간(60초)에서 조회 한 번(10초 제한)과 반영을 뺀 여유.

/** 한 회차의 시간 예산. 이 시간이 지난 뒤에는 새 줄의 결제사 조회를 시작하지 않는다. */
export const RECONCILE_RUN_BUDGET_MS = 40_000;

export type ReconcileSourceKind = "initial" | "difference" | "revgift";

export type ReconcileTarget = { source: ReconcileSourceKind; tossOrderId: string; amountKrw: number; confirmingAt: Date };

/** 결제 종류 하나의 반영. 둘 다 이번 호출이 기록을 바꿨는지 돌려준다. */
export type ReconcileSettler = {
  settleDone(tossOrderId: string, paymentKey: string): Promise<boolean>;
  settleFailed(tossOrderId: string): Promise<boolean>;
};

export type ReconcileDeps = {
  /** 주문번호를 주면 그 주문(역조공은 그 몫이 든 보내기)의 대상만 */
  listTargets(orderNo: string | null): Promise<ReconcileTarget[]>;
  /** 결제사를 부르기 직전에 그 줄의 「확인한 시각」을 지금으로 */
  markChecked(source: ReconcileSourceKind, tossOrderId: string): Promise<void>;
  markReview(source: ReconcileSourceKind, tossOrderId: string): Promise<boolean>;
  lookup(tossOrderId: string): Promise<TossLookup>;
  settlers: Record<ReconcileSourceKind, ReconcileSettler>;
  now(): Date;
};

export type ReconcileCounts = { checked: number; done: number; failed: number; review: number; kept: number; errors: number; skipped: number };
export type ReconcileResult = { ok: boolean; counts: ReconcileCounts };

export async function reconcilePayments(deps: ReconcileDeps, orderNo: string | null): Promise<ReconcileResult> {
  const counts: ReconcileCounts = { checked: 0, done: 0, failed: 0, review: 0, kept: 0, errors: 0, skipped: 0 };
  const startedAt = deps.now().getTime();
  const targets = await deps.listTargets(orderNo);
  for (const t of targets) {
    if (deps.now().getTime() - startedAt > RECONCILE_RUN_BUDGET_MS) {
      counts.skipped += 1;
      continue;
    }
    counts.checked += 1;
    try {
      await deps.markChecked(t.source, t.tossOrderId);
      const lookup = await deps.lookup(t.tossOrderId);
      // 조회 오류는 그 줄을 그대로 두지만 실행 결과는 실패로 센다(성공으로 보이지 않게)
      if (lookup.kind === "error") counts.errors += 1;
      const decision = judgeReconcile(lookup, { orderId: t.tossOrderId, amountKrw: t.amountKrw, confirmingAt: t.confirmingAt }, deps.now());
      const settler = deps.settlers[t.source];
      let changed = false;
      if (decision.kind === "done") changed = await settler.settleDone(t.tossOrderId, decision.paymentKey);
      else if (decision.kind === "failed") changed = await settler.settleFailed(t.tossOrderId);
      else if (decision.kind === "needs_review") changed = await deps.markReview(t.source, t.tossOrderId);
      // 바꾸지 못했으면(다른 처리가 먼저 반영) 그대로 둔 것으로 센다
      if (changed && decision.kind === "done") counts.done += 1;
      else if (changed && decision.kind === "failed") counts.failed += 1;
      else if (changed && decision.kind === "needs_review") counts.review += 1;
      else counts.kept += 1;
    } catch {
      counts.errors += 1;
      counts.kept += 1;
    }
  }
  return { ok: counts.errors === 0, counts };
}
