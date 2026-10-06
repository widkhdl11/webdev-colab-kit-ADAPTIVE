import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DifferencePayment, DifferencePaymentStore } from "../model/confirm-difference";

// 차액 결제 저장소 — DB 구현. 관리자 키 클라이언트를 받는다(앱 서버 전용).
// 쓰기는 DB 함수(claim_difference_payment·settle_difference_payment)로만 한다.

const row = z.object({
  toss_order_id: z.string(),
  amount_krw: z.number().int(),
  status: z.enum(["pending", "confirming", "done", "failed"]),
  orders: z.object({ order_no: z.string(), fan_id: z.string() }),
});

export function createSupabaseDifferenceStore(admin: SupabaseClient): DifferencePaymentStore {
  return {
    async find(tossOrderId) {
      const { data, error } = await admin
        .from("payments")
        .select("toss_order_id, amount_krw, status, orders!inner(order_no, fan_id)")
        .eq("toss_order_id", tossOrderId)
        .eq("kind", "difference")
        .maybeSingle();
      if (error) throw new Error(`차액 결제 기록을 읽지 못했다: ${error.code}`);
      if (!data) return null;
      const r = row.parse(data);
      const found: DifferencePayment = {
        orderId: r.toss_order_id,
        amountKrw: r.amount_krw,
        status: r.status,
        orderNo: r.orders.order_no,
        senderId: r.orders.fan_id,
      };
      return found;
    },
    async claim(tossOrderId) {
      const { data, error } = await admin.rpc("claim_difference_payment", { p_toss_order_id: tossOrderId });
      if (error) throw new Error(`차액 결제 승인 권리를 얻지 못했다: ${error.code}`);
      return data === true;
    },
    async settle(tossOrderId, outcome) {
      const { data, error } = await admin.rpc("settle_difference_payment", {
        p_toss_order_id: tossOrderId,
        p_status: outcome.status,
        p_payment_key: outcome.status === "done" ? outcome.paymentKey : null,
      });
      if (error) throw new Error(`차액 결제 결과를 반영하지 못했다: ${error.code}`);
      return data === true;
    },
  };
}
