import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { BoxPayment, BoxPaymentStore } from "../model/box-payment";

// 선물함 결제 저장소 — DB 구현. 관리자 키 클라이언트를 받는다(앱 서버 전용 — 확정 시작·결과 기록 함수는 서버 키만 부를 수 있다).
// 쓰기는 DB 함수(claim_revgift_box_payment·settle_revgift_box_payment)로만 한다.

const row = z.object({
  toss_order_id: z.string(),
  amount_krw: z.number().int(),
  status: z.enum(["pending", "confirming", "done", "failed"]),
  box_id: z.string().uuid(),
  revgift_boxes: z.object({ owner_id: z.string().uuid() }),
});

export function createSupabaseBoxPaymentStore(admin: SupabaseClient): BoxPaymentStore {
  return {
    async find(orderId) {
      const { data, error } = await admin
        .from("revgift_box_payments")
        .select("toss_order_id, amount_krw, status, box_id, revgift_boxes(owner_id)")
        .eq("toss_order_id", orderId)
        .maybeSingle();
      if (error) throw new Error(`선물함 결제 기록을 읽지 못했다: ${error.code}`);
      if (!data) return null;
      const r = row.parse(data);
      const record: BoxPayment = { orderId: r.toss_order_id, amountKrw: r.amount_krw, status: r.status, boxId: r.box_id, ownerId: r.revgift_boxes.owner_id };
      return record;
    },
    async claim(orderId) {
      const { data, error } = await admin.rpc("claim_revgift_box_payment", { p_toss_order_id: orderId });
      if (error) throw new Error(`선물함 결제 승인 권리를 얻지 못했다: ${error.code}`);
      return data === true;
    },
    async settle(orderId, outcome) {
      const { data, error } = await admin.rpc("settle_revgift_box_payment", {
        p_toss_order_id: orderId,
        p_status: outcome.status,
        p_payment_key: outcome.status === "done" ? outcome.paymentKey : null,
      });
      if (error) throw new Error(`선물함 결제 결과를 반영하지 못했다: ${error.code}`);
      return data === true;
    },
  };
}
