import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DepositRecord } from "@/entities/payment/model/deposit";

// 무통장 입금의 DB 쪽 (payment INV-M21~M24). 관리자 키 클라이언트를 받는다(앱 서버 전용 — 함수 모두 앱 서버 키만 부를 수 있다).
// 읽은 행은 신뢰 경계 밖이라 여기서 형식을 검사한다.

export type StoredDeposit = DepositRecord & {
  /** 결제 승인 때 저장한 웹훅 비밀 값의 SHA-256(16진수). 없으면 null — 그 결제의 입금 알림은 받지 않는다 */
  secretSha256: string | null;
};

export type DepositTarget = { orderId: string; amountKrw: number; paymentKey: string; dueAt: Date };

export type DepositStore = {
  find(orderId: string): Promise<StoredDeposit | null>;
  /** 입금 대기 → 실패(주문은 결제 전으로 끝남), 팬 알림(INV-M23). 바꿨으면 true */
  close(orderId: string): Promise<boolean>;
  /** 완료 뒤 되돌림 표시(INV-M24) */
  markReverted(orderId: string): Promise<boolean>;
  /** 입금 대기의 확인 필요 표시 */
  markReview(orderId: string): Promise<boolean>;
  listTargets(orderNo: string | null): Promise<DepositTarget[]>;
  markChecked(orderId: string): Promise<void>;
};

const rowShape = z.object({
  toss_order_id: z.string(),
  amount_krw: z.number().int(),
  status: z.string(),
  deposit_due_at: z.string().nullable(),
  deposit_secret_hash: z.string().nullable(),
});

const targetShape = z.object({
  toss_order_id: z.string().min(1),
  amount_krw: z.number().int().positive(),
  payment_key: z.string().min(1),
  due_at: z.string(),
});

/** PostgREST 는 bytea 를 「\x」+16진수로 돌려준다. */
function hexOfBytea(v: string | null): string | null {
  if (v === null) return null;
  const m = /^\\x([0-9a-f]{64})$/.exec(v);
  return m ? m[1]! : null;
}

function dateOrThrow(v: string): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("입금 기한의 꼴이 다르다");
  return d;
}

export function createSupabaseDepositStore(admin: Pick<SupabaseClient, "rpc" | "from">): DepositStore {
  async function call(fn: string, args: Record<string, unknown>, what: string): Promise<boolean> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${what}: ${error.code}`);
    return data === true;
  }
  return {
    async find(orderId) {
      const { data, error } = await admin
        .from("payments")
        .select("toss_order_id, amount_krw, status, deposit_due_at, deposit_secret_hash")
        .eq("toss_order_id", orderId)
        .eq("kind", "initial")
        .maybeSingle();
      if (error) throw new Error(`결제 기록을 읽지 못했다: ${error.code}`);
      if (!data) return null;
      const r = rowShape.parse(data);
      return {
        orderId: r.toss_order_id,
        amountKrw: r.amount_krw,
        status: r.status === "waiting_deposit" || r.status === "done" ? r.status : "other",
        dueAt: r.deposit_due_at === null ? null : dateOrThrow(r.deposit_due_at),
        secretSha256: hexOfBytea(r.deposit_secret_hash),
      };
    },
    close: (orderId) => call("close_deposit_expired", { p_toss_order_id: orderId }, "기한 지난 입금 대기를 닫지 못했다"),
    markReverted: (orderId) => call("payment_deposit_reverted", { p_toss_order_id: orderId }, "되돌림 표시를 달지 못했다"),
    markReview: (orderId) => call("deposit_mark_review", { p_toss_order_id: orderId }, "확인 필요 표시를 달지 못했다"),
    async listTargets(orderNo) {
      const { data, error } = await admin.rpc("deposit_reconcile_targets", { p_order_no: orderNo });
      if (error) throw new Error(`조회할 입금 대기 목록을 읽지 못했다: ${error.code}`);
      return z
        .array(targetShape)
        .parse(data)
        .map((r) => ({ orderId: r.toss_order_id, amountKrw: r.amount_krw, paymentKey: r.payment_key, dueAt: dateOrThrow(r.due_at) }));
    },
    async markChecked(orderId) {
      const { error } = await admin.rpc("payment_mark_checked", { p_source: "initial", p_toss_order_id: orderId });
      if (error) throw new Error(`확인한 시각을 남기지 못했다: ${error.code}`);
    },
  };
}
