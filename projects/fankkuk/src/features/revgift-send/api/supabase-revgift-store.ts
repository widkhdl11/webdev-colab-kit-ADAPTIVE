import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { RevgiftPayment, RevgiftPaymentStore } from "../model/confirm-revgift";
import type { RevgiftStore } from "../model/register-revgift";

// 역조공 보내기·결제 저장소 — DB 구현. 관리자 키 클라이언트를 받는다(앱 서버 전용).
// 쓰기는 DB 함수(register_revgift·claim_revgift_payment·settle_revgift_payment)로만 한다.

function refused(refusal: "not_follower" | "order_no_taken"): Error {
  return Object.assign(new Error(`역조공 등록 거부: ${refusal}`), { refusal });
}

export function createSupabaseRevgiftStore(admin: SupabaseClient): RevgiftStore {
  return {
    async create({ senderId, tossOrderId, charge, shares }) {
      const { data, error } = await admin.rpc("register_revgift", {
        p_sender: senderId,
        p_shares: shares.map((s) => ({
          fan_id: s.fanId,
          tier: s.tier,
          order_no: s.orderNo,
          amount_krw: s.amountKrw,
          shipping_fee_krw: s.shippingFeeKrw,
        })),
        p_toss_order_id: tossOrderId,
        p_goods_krw: charge.goodsKrw,
        p_service_fee_krw: charge.serviceFeeKrw,
        p_inspection_fee_krw: charge.inspectionFeeKrw,
        p_shipping_fee_krw: charge.shippingFeeKrw,
        p_amount_krw: charge.totalKrw,
      });
      // INV-R1 두 번째 장치: 받는 사람이 나를 팔로우하는 팬 계정이 아니다
      if (error?.code === "P0021") throw refused("not_follower");
      if (error?.code === "23505" && error.message.includes("revgift_shares_order_no_key")) throw refused("order_no_taken");
      if (error) throw new Error(`역조공을 등록하지 못했다: ${error.code}`);
      return { sendId: z.string().uuid().parse(data) };
    },
  };
}

const paymentRow = z.object({
  toss_order_id: z.string(),
  amount_krw: z.number().int(),
  status: z.enum(["pending", "confirming", "done", "failed"]),
  sender_id: z.string(),
});

export function createSupabaseRevgiftPaymentStore(admin: SupabaseClient): RevgiftPaymentStore {
  async function find(orderId: string): Promise<RevgiftPayment | null> {
    const { data, error } = await admin
      .from("revgift_sends")
      .select("toss_order_id, amount_krw, status, sender_id")
      .eq("toss_order_id", orderId)
      .maybeSingle();
    if (error) throw new Error(`역조공 결제 기록을 읽지 못했다: ${error.code}`);
    if (!data) return null;
    const r = paymentRow.parse(data);
    return { orderId: r.toss_order_id, amountKrw: r.amount_krw, status: r.status, senderId: r.sender_id };
  }
  return {
    find,
    async claim(orderId) {
      const { data, error } = await admin.rpc("claim_revgift_payment", { p_toss_order_id: orderId });
      if (error) throw new Error(`역조공 결제 승인 권리를 얻지 못했다: ${error.code}`);
      return data === true;
    },
    async settle(orderId, outcome) {
      const { data, error } = await admin.rpc("settle_revgift_payment", {
        p_toss_order_id: orderId,
        p_status: outcome.status,
        p_payment_key: outcome.status === "done" ? outcome.paymentKey : null,
      });
      if (error) throw new Error(`역조공 결제 결과를 반영하지 못했다: ${error.code}`);
      return data === true;
    },
  };
}
