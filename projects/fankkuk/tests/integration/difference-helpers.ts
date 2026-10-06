import { adminClient, payTestOrder, psql, SEED, signedInClient } from "./helpers";
import { fanSetsWaybill, receiveAndLabel, waybill } from "./office-helpers";

// 차액 결제 통합 시험 공용 (payment INV-M11~M13). 시드 주문은 건드리지 않는다 — 새 주문(물건 이름 「시험 선물」)만 만든다.

type Tier = "small" | "medium" | "large";
const PRICE: Record<Tier, { total: number; carrier: number; inspection: number }> = {
  small: { total: 6900, carrier: 4000, inspection: 1500 },
  medium: { total: 8900, carrier: 5000, inspection: 2000 },
  large: { total: 10900, carrier: 6500, inspection: 2500 },
};

export function code(n: number): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join("");
}

/** 별빛 → 하루, 상자 구간을 골라 결제까지 끝낸 주문. */
export async function paidOrder(tiers: Tier[]): Promise<{ orderId: string; orderNo: string; requestId: string; boxIds: string[] }> {
  const orderNo = `FC-T${code(6)}`;
  const tossOrderId = `pay_test_${code(12).toLowerCase()}`;
  const sum = (f: (t: Tier) => number) => tiers.reduce((a, t) => a + f(t), 0);
  const { data, error } = await adminClient().rpc("register_order", {
    p_fan_id: SEED.fanId,
    p_creator_id: SEED.haruCreatorId,
    p_order_no: orderNo,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: tiers,
    p_toss_order_id: tossOrderId,
    p_goods_krw: 0,
    p_service_fee_krw: sum((t) => PRICE[t].total - PRICE[t].carrier - PRICE[t].inspection),
    p_inspection_fee_krw: sum((t) => PRICE[t].inspection),
    p_shipping_fee_krw: sum((t) => PRICE[t].carrier),
    p_amount_krw: sum((t) => PRICE[t].total),
  });
  if (error) throw new Error(`register_order 실패: ${error.message}`);
  const requestId = await payTestOrder({ orderNo, tossOrderId });
  const boxIds = psql(`select string_agg(id::text, ',' order by seq) from public.boxes where order_id = '${data as string}'`).split(",");
  return { orderId: data as string, orderNo, requestId, boxIds };
}

/** 첫 상자를 입고·라벨까지. 돌려주는 값은 라벨 QR. */
export async function labeled(boxId: string): Promise<string> {
  const no = waybill();
  await fanSetsWaybill(boxId, no);
  return receiveAndLabel(await signedInClient("fankkuk_staff"), no);
}

export async function measure(qr: string, tier: string, who = "fankkuk_staff") {
  return (await signedInClient(who)).rpc("office_record_measurement", { p_qr: qr, p_tier: tier });
}

export function differenceRow(orderId: string): string {
  return psql(
    `select coalesce(string_agg(amount_krw || '/' || goods_krw || '/' || service_fee_krw || '/' || inspection_fee_krw || '/' || shipping_fee_krw || '/' || status, ';'), '') from public.payments where order_id = '${orderId}' and kind = 'difference'`,
  );
}

export function differenceToss(orderId: string): string {
  return psql(`select toss_order_id from public.payments where order_id = '${orderId}' and kind = 'difference'`);
}

/** 팬이 선물 상세에서 「차액 결제하기」를 누른다 — 결제창에 넘길 orderId·금액을 받는다. */
export async function prepare(boxId: string, who = "byeolbit_fan") {
  return (await signedInClient(who)).rpc("prepare_difference_payment", { p_box_id: boxId });
}
