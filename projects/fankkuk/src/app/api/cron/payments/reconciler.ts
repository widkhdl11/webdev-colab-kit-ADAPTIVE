import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { settleGiftDone } from "@/features/checkout/model/checkout";
import { createSupabaseDifferenceStore } from "@/features/difference-pay/api/supabase-difference-store";
import { settleDifferenceDone } from "@/features/difference-pay/model/confirm-difference";
import { createSupabaseDepositStore } from "@/features/deposit-confirm/api/supabase-deposit-store";
import { reconcileDeposits } from "@/features/deposit-confirm/model/reconcile-deposits";
import { createSupabaseReconcileStore } from "@/features/payment-reconcile/api/supabase-reconcile-store";
import { RECONCILE_RUN_BUDGET_MS, reconcilePayments, type ReconcileResult } from "@/features/payment-reconcile/model/reconcile-payments";
import { createSupabaseRevgiftPaymentStore } from "@/features/revgift-send/api/supabase-revgift-store";
import { settleRevgiftDone } from "@/features/revgift-send/model/confirm-revgift";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createTossPaymentsClient, readTossSecretKey, type TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 결과를 모르는 결제 다시 확인의 서버 조립 (payment INV-M19). 예약 입구(api/cron/payments)와
// 관리자 「지금 돌리기」(api/admin/work/expiry)가 같이 쓴다. DB 는 앱 서버 키, 결제사는 서버 비밀 키(INV-M4).
// 완료 반영은 결제 종류마다 성공 주소의 확정 흐름이 쓰는 것과 같은 함수다 — 팬 선물은 승인 요청 원문까지 만든다(INV-M6).
// 결제사 클라이언트는 조회할 대상이 있을 때 처음 만든다 — 대상이 없으면 비밀 키가 없는 환경에서도 그냥 끝난다.
// 이어서 같은 시간 예산 안에서 무통장 입금 대기를 조회한다(payment INV-M22 놓친 알림 · INV-M23 기한 지남, features/deposit-confirm).
// 세는 칸은 하나로 합친다 — 입금 확인은 done, 기한 지남 닫기는 failed.

export async function runServerReconcile(orderNo: string | null): Promise<ReconcileResult> {
  const startedAt = Date.now();
  const admin = createAdminSupabase();
  const gifts = createSupabasePaymentStore(admin);
  const differences = createSupabaseDifferenceStore(admin);
  const revgifts = createSupabaseRevgiftPaymentStore(admin);
  let toss: TossPaymentsClient | null = null;
  const tossClient = (): TossPaymentsClient => {
    toss ??= createTossPaymentsClient({ secretKey: readTossSecretKey(process.env), env: process.env, fetchImpl: fetch });
    return toss;
  };

  const payments = await reconcilePayments(
    {
      ...createSupabaseReconcileStore(admin),
      lookup: (tossOrderId) => tossClient().getByOrderId(tossOrderId),
      settlers: {
        initial: {
          settleDone: async (tossOrderId, paymentKey) => {
            const record = await gifts.find(tossOrderId);
            return record ? settleGiftDone(gifts, record, paymentKey) : false;
          },
          settleFailed: (tossOrderId) => gifts.settle(tossOrderId, { status: "failed" }),
          settleWaiting: (tossOrderId, issued) => gifts.settleWaiting(tossOrderId, issued),
        },
        difference: {
          settleDone: (tossOrderId, paymentKey) => settleDifferenceDone(differences, tossOrderId, paymentKey),
          settleFailed: (tossOrderId) => differences.settle(tossOrderId, { status: "failed" }),
        },
        revgift: {
          settleDone: (tossOrderId, paymentKey) => settleRevgiftDone(revgifts, tossOrderId, paymentKey),
          settleFailed: (tossOrderId) => revgifts.settle(tossOrderId, { status: "failed" }),
        },
      },
      now: () => new Date(),
    },
    orderNo,
  );

  const deposits = await reconcileDeposits(
    {
      store: createSupabaseDepositStore(admin),
      lookup: (tossOrderId) => tossClient().getByOrderId(tossOrderId),
      cancel: (req) => tossClient().cancel(req),
      settleDone: async (tossOrderId, paymentKey) => {
        const record = await gifts.find(tossOrderId);
        return record ? settleGiftDone(gifts, record, paymentKey) : false;
      },
      now: () => new Date(),
    },
    orderNo,
    startedAt + RECONCILE_RUN_BUDGET_MS,
  );

  const c = payments.counts;
  const counts = {
    checked: c.checked + deposits.checked,
    done: c.done + deposits.done,
    failed: c.failed + deposits.failed,
    review: c.review + deposits.review,
    kept: c.kept + deposits.kept,
    errors: c.errors + deposits.errors,
    skipped: c.skipped + deposits.skipped,
  };
  return { ok: counts.errors === 0, counts };
}
