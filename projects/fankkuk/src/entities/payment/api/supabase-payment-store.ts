import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseChargeBreakdown } from "../model/charge";
import { OrderNoTakenError, type PaymentStore, type StoredPayment } from "./payment-store";

// 결제 기록 저장소 — DB 구현. 관리자 키 클라이언트를 받는다(앱 서버 전용).
// 쓰기는 전부 DB 함수(register_order·claim_payment·settle_payment)로 한다 — 한 처리 안에서 일어나야 하는 것들이
// (주문+상자+결제 대기, 결제 완료+등록+승인 요청) DB 안에서 한 번에 일어나게.
// 읽은 행은 신뢰 경계 밖이라 여기서 형식을 검사한다.

const rowSchema = z.object({
  toss_order_id: z.string(),
  amount_krw: z.number().int(),
  goods_krw: z.number().int(),
  service_fee_krw: z.number().int(),
  shipping_fee_krw: z.number().int(),
  status: z.enum(["pending", "confirming", "done", "failed"]),
  payment_key: z.string().nullable(),
  orders: z.object({ order_no: z.string(), fan_id: z.string(), profiles: z.object({ nickname: z.string() }) }),
});

function toStored(row: unknown): StoredPayment {
  const r = rowSchema.parse(row);
  const charge = parseChargeBreakdown({
    goodsKrw: r.goods_krw,
    serviceFeeKrw: r.service_fee_krw,
    shippingFeeKrw: r.shipping_fee_krw,
    totalKrw: r.amount_krw,
  });
  // INV-M7: 저장된 세 칸의 합이 금액과 다르면 이 기록으로 결제를 진행하지 않는다
  if (!charge) throw new Error("결제 기록의 칸 합계가 금액과 다르다");
  return {
    orderId: r.toss_order_id,
    orderNo: r.orders.order_no,
    amountKrw: r.amount_krw,
    status: r.status,
    paymentKey: r.payment_key,
    charge,
    fanId: r.orders.fan_id,
    fanNickname: r.orders.profiles.nickname,
  };
}

const SELECT = "toss_order_id, amount_krw, goods_krw, service_fee_krw, shipping_fee_krw, status, payment_key, orders(order_no, fan_id, profiles(nickname))";

export function createSupabasePaymentStore(admin: SupabaseClient): PaymentStore {
  async function find(orderId: string): Promise<StoredPayment | null> {
    const { data, error } = await admin.from("payments").select(SELECT).eq("toss_order_id", orderId).eq("kind", "initial").maybeSingle();
    if (error) throw new Error(`결제 기록을 읽지 못했다: ${error.code}`);
    return data ? toStored(data) : null;
  }

  return {
    async create({ orderId, orderNo, charge, registration }) {
      const { error } = await admin.rpc("register_order", {
        p_fan_id: registration.fanId,
        p_creator_id: registration.creatorId,
        p_order_no: orderNo,
        p_item_kind: registration.itemKind,
        p_has_electronics_or_metal: registration.hasElectronicsOrMetal,
        p_tiers: registration.boxes,
        p_toss_order_id: orderId,
        p_goods_krw: charge.goodsKrw,
        p_service_fee_krw: charge.serviceFeeKrw,
        p_shipping_fee_krw: charge.shippingFeeKrw,
        p_amount_krw: charge.totalKrw,
      });
      if (error?.code === "23505" && error.message.includes("orders_order_no_key")) throw new OrderNoTakenError();
      if (error) throw new Error(`선물을 등록하지 못했다: ${error.code}`);
      const stored = await find(orderId);
      if (!stored) throw new Error("등록한 결제 기록을 다시 읽지 못했다");
      return stored;
    },
    find,
    async claim(orderId) {
      const { data, error } = await admin.rpc("claim_payment", { p_toss_order_id: orderId });
      if (error) throw new Error(`결제 승인 권리를 얻지 못했다: ${error.code}`);
      return data === true;
    },
    async settle(orderId, outcome) {
      const done = outcome.status === "done";
      const { data, error } = await admin.rpc("settle_payment", {
        p_toss_order_id: orderId,
        p_status: outcome.status,
        p_payment_key: done ? outcome.paymentKey : null,
        p_request_id: done ? outcome.approvalRequest.requestId : null,
        p_payload: done ? outcome.approvalRequest.payload : null,
        p_requested_at: done ? outcome.approvalRequest.requestedAt : null,
      });
      if (error) throw new Error(`결제 결과를 반영하지 못했다: ${error.code}`);
      return data === true;
    },
  };
}
