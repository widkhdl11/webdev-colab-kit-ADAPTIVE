import { psql, SEED } from "./helpers";

// 요금표 통합 시험 공용 (admin-console INV-K1~K6). 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자.

export type Row = { tier: string; price_krw: number; carrier_cost_krw: number; inspection_fee_krw: number };

export const FIRST: Row[] = [
  { tier: "small", price_krw: 6900, carrier_cost_krw: 4000, inspection_fee_krw: 1500 },
  { tier: "medium", price_krw: 8900, carrier_cost_krw: 5000, inspection_fee_krw: 2000 },
  { tier: "large", price_krw: 10900, carrier_cost_krw: 6500, inspection_fee_krw: 2500 },
];

export const OWNER_ID = "00000000-0000-4000-a000-000000000021";
export const STAFF_ID = "00000000-0000-4000-a000-000000000022";

export type TablePatch = Partial<Record<string, Partial<Row>>>;

export function table(patch: TablePatch = {}): Row[] {
  return FIRST.map((r) => ({ ...r, ...patch[r.tier] }));
}

export function pricesNow(): string {
  return psql(
    "select string_agg(tier || ':' || price_krw || '/' || carrier_cost_krw || '/' || inspection_fee_krw, ',' order by tier) from public.tier_prices",
  );
}

// enum 순서(small < medium < large)로 정렬된 값
export const FIRST_TEXT = "small:6900/4000/1500,medium:8900/5000/2000,large:10900/6500/2500";

/** 시험이 바꾼 요금표·기록을 처음으로 되돌린다(기록 표는 추가만이라 트리거를 끄고 지운다). */
export function resetPrices(): void {
  psql(
    [
      "begin;",
      ...FIRST.map(
        (r) =>
          `update public.tier_prices set price_krw = ${r.price_krw}, carrier_cost_krw = ${r.carrier_cost_krw}, inspection_fee_krw = ${r.inspection_fee_krw} where tier = '${r.tier}';`,
      ),
      "set local session_replication_role = replica;",
      "delete from public.tier_price_changes;",
      "commit;",
    ].join(" "),
  );
}

export function randomCode(n: number): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join("");
}

export type Amounts = { goods?: number; service: number; inspection: number; shipping: number; total: number };

export function orderArgs(tiers: string[], a: Amounts) {
  return {
    p_fan_id: SEED.fanId,
    p_creator_id: SEED.haruCreatorId,
    p_order_no: `FC-T${randomCode(6)}`,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: tiers,
    p_toss_order_id: `pay_test_${randomCode(12).toLowerCase()}`,
    p_goods_krw: a.goods ?? 0,
    p_service_fee_krw: a.service,
    p_inspection_fee_krw: a.inspection,
    p_shipping_fee_krw: a.shipping,
    p_amount_krw: a.total,
  };
}

export const SMALL_FIRST: Amounts = { service: 1400, inspection: 1500, shipping: 4000, total: 6900 };
export const SMALL_RAISED: Amounts = { service: 1900, inspection: 1500, shipping: 4000, total: 7400 };

/** 시험이 만든 역조공 보내기(결제 주문번호 pay_test_rg_*)를 지운다. */
export function deleteTestRevgifts(): void {
  psql(
    "delete from public.revgift_shares where send_id in (select id from public.revgift_sends where toss_order_id like 'pay_test_rg_%'); delete from public.revgift_sends where toss_order_id like 'pay_test_rg_%';",
  );
}
