import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ReconcileDeps, ReconcileSourceKind, ReconcileTarget } from "../model/reconcile-payments";

// 결제 다시 확인의 DB 쪽 (payment INV-M19). 관리자 키 클라이언트를 받는다(앱 서버 전용 — 두 함수 모두 앱 서버 키만 부를 수 있다).
// 대상 목록: 「승인 중」이 된 지 10분이 지났고 확인 필요 표시가 없는 결제(팬 선물·차액·역조공). 10분 조건은 DB 함수가 DB 시각으로 본다.
// 한 회차 6줄, 「확인한 시각」이 오래된 순(없으면 먼저) — 확인한 시각은 결제사를 부르기 전에 남긴다(payment_mark_checked).
// 확인 필요 표시: 승인 중이고 아직 표시가 없는 줄에만 단다. 완료·실패 반영은 결제 종류마다 기존 반영 함수를 쓴다(여기 없음).

const targetRow = z.object({
  source: z.enum(["initial", "difference", "revgift"]),
  toss_order_id: z.string().min(1),
  amount_krw: z.number().int().positive(),
  confirming_at: z.string(),
});

export function createSupabaseReconcileStore(admin: Pick<SupabaseClient, "rpc">): Pick<ReconcileDeps, "listTargets" | "markChecked" | "markReview"> {
  return {
    async listTargets(orderNo) {
      const { data, error } = await admin.rpc("payment_reconcile_targets", { p_order_no: orderNo });
      if (error) throw new Error(`다시 확인할 결제 목록을 읽지 못했다: ${error.code}`);
      return z
        .array(targetRow)
        .parse(data)
        .map((r): ReconcileTarget => {
          const confirmingAt = new Date(r.confirming_at);
          if (Number.isNaN(confirmingAt.getTime())) throw new Error("승인 중이 된 시각의 꼴이 다르다");
          return { source: r.source, tossOrderId: r.toss_order_id, amountKrw: r.amount_krw, confirmingAt };
        });
    },
    async markChecked(source: ReconcileSourceKind, tossOrderId: string) {
      const { error } = await admin.rpc("payment_mark_checked", { p_source: source, p_toss_order_id: tossOrderId });
      if (error) throw new Error(`확인한 시각을 남기지 못했다: ${error.code}`);
    },
    async markReview(source: ReconcileSourceKind, tossOrderId: string, paymentKey: string, balanceKrw: number | null) {
      const { data, error } = await admin.rpc("payment_mark_review", {
        p_source: source,
        p_toss_order_id: tossOrderId,
        p_payment_key: paymentKey,
        p_balance_krw: balanceKrw,
      });
      if (error) throw new Error(`확인 필요 표시를 달지 못했다: ${error.code}`);
      return data === true;
    },
  };
}
