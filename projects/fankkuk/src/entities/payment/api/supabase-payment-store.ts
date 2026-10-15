import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseChargeBreakdown } from "../model/charge";
import { OrderNoTakenError, PriceChangedError, SenderRefusedError, type PaymentStore, type StoredPayment } from "./payment-store";

// 결제 기록 저장소 — DB 구현. 관리자 키 클라이언트를 받는다(앱 서버 전용).
// 쓰기는 전부 DB 함수(register_order·claim_payment·settle_payment)로 한다 — 한 처리 안에서 일어나야 하는 것들이
// (주문+상자+결제 대기, 결제 완료+등록+승인 요청) DB 안에서 한 번에 일어나게.
// 읽은 행은 신뢰 경계 밖이라 여기서 형식을 검사한다.

const rowSchema = z.object({
  toss_order_id: z.string(),
  amount_krw: z.number().int(),
  goods_krw: z.number().int(),
  service_fee_krw: z.number().int(),
  inspection_fee_krw: z.number().int(),
  shipping_fee_krw: z.number().int(),
  status: z.enum(["pending", "confirming", "waiting_deposit", "done", "failed"]),
  payment_key: z.string().nullable(),
  orders: z.object({ order_no: z.string(), fan_id: z.string(), profiles: z.object({ nickname: z.string() }) }),
});

function toStored(row: unknown): StoredPayment {
  const r = rowSchema.parse(row);
  const charge = parseChargeBreakdown({
    goodsKrw: r.goods_krw,
    serviceFeeKrw: r.service_fee_krw,
    inspectionFeeKrw: r.inspection_fee_krw,
    shippingFeeKrw: r.shipping_fee_krw,
    totalKrw: r.amount_krw,
  });
  // INV-M7: 저장된 네 칸의 합이 금액과 다르면 이 기록으로 결제를 진행하지 않는다
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

const SELECT = "toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, payment_key, orders(order_no, fan_id, profiles(nickname))";

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
        // hard-items INV-H1: 종류 코드를 넘기고, 기타 글만 p_item_kind 로 — 물품 이름은 DB 가 정한다
        p_item_kind: registration.itemOther,
        p_has_electronics_or_metal: registration.hasElectronicsOrMetal,
        p_tiers: registration.boxes,
        p_toss_order_id: orderId,
        p_goods_krw: charge.goodsKrw,
        p_service_fee_krw: charge.serviceFeeKrw,
        p_inspection_fee_krw: charge.inspectionFeeKrw,
        p_shipping_fee_krw: charge.shippingFeeKrw,
        p_amount_krw: charge.totalKrw,
        p_anniversary_name: registration.anniversaryName,
        p_item_category: registration.itemCategory,
        // metrics INV-Q5: 안내가 뜬 품목 — DB 가 그때의 받기 어려운 품목과 다시 맞춰 보고 아니면 버린다
        p_hard_notice_category: registration.hardNoticeCategory,
      });
      if (error?.code === "23505" && error.message.includes("orders_order_no_key")) throw new OrderNoTakenError();
      // INV-K3: 등록 순간의 요금표로 다시 계산한 금액과 다르다 — 요금이 방금 바뀌었다
      if (error?.code === "P0031") throw new PriceChangedError();
      if (error?.code === "P0011") throw new SenderRefusedError("self");
      if (error?.code === "P0012") throw new SenderRefusedError("no_follow");
      if (error?.code === "42501") throw new SenderRefusedError("role");
      // creator-verification INV-V12: 받는 크리에이터가 채널 이사 중
      if (error?.code === "FKV10") throw new SenderRefusedError("moving");
      // creator-receiving INV-B2: 쉬는 중 · INV-B4: 이번 달 한도에 닿았다
      if (error?.code === "FKR01") throw new SenderRefusedError("resting");
      if (error?.code === "FKR02") throw new SenderRefusedError("limit");
      // hard-items INV-H7: 받기 어려운 품목을 「등록 막기」로 둔 크리에이터
      if (error?.code === "FKR03") throw new SenderRefusedError("hard_item");
      // 22023 은 상자 수 경계와 같이 쓰지만 상자 수는 입력 검사가 먼저 막는다 — 남는 것은 받을 수 없는 크리에이터다
      if (error?.code === "22023" && error.message.includes("받을 수 없는 크리에이터")) throw new SenderRefusedError("unknown_creator");
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
    async settleWaiting(orderId, issued) {
      const { data, error } = await admin.rpc("settle_payment_waiting", {
        p_toss_order_id: orderId,
        p_payment_key: issued.paymentKey,
        // 웹훅 검증 값은 원문을 두지 않는다 — 웹훅이 오면 같은 해시로 맞대어 본다(INV-M22)
        p_secret_sha256: createHash("sha256").update(issued.secret, "utf8").digest("hex"),
        p_bank_code: issued.bankCode,
        p_account_no: issued.accountNumber,
      });
      if (error) throw new Error(`입금 대기를 기록하지 못했다: ${error.code}`);
      return data === true;
    },
  };
}
