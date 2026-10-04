import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";
import { payTestRevgift, PROFILE, registerTestRevgift } from "./revgift-helpers";

// 사무실 작업 흐름 통합 시험 공용 (office-workflow INV-W1~W8).
// 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자, byeolbit_fan = 별빛(시험 주문의 팬), haru_creator = 하루.

export type Unit = { kind: "box"; orderId: string; orderNo: string; requestId: string; boxIds: string[] };
export type ShareUnit = { kind: "share"; sendId: string; shareId: string; orderNo: string };

/** 시험마다 다른 원 송장번호(숫자 12자리). */
export function waybill(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => String(b % 10)).join("");
}

/** 결제까지 끝난 팬 선물(별빛 → 하루). 상자 n 개. */
export async function paidGift(boxCount = 1): Promise<Unit> {
  const o = await registerTestOrder(boxCount);
  const requestId = await payTestOrder(o);
  const boxIds = psql(`select string_agg(id::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}'`).split(",");
  return { kind: "box", orderId: o.orderId, orderNo: o.orderNo, requestId, boxIds };
}

/** 결제까지 끝난 역조공 몫 하나(하루 → 별빛). */
export async function paidShare(): Promise<ShareUnit> {
  const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
  await payTestRevgift(send);
  const shareId = psql(`select id from public.revgift_shares where send_id = '${send.sendId}'`);
  return { kind: "share", sendId: send.sendId, shareId, orderNo: send.orderNos[0] };
}

/** 팬이 상자 송장번호를 넣는다. */
export async function fanSetsWaybill(boxId: string, no: string): Promise<void> {
  const fan = await signedInClient("byeolbit_fan");
  const r = await fan.rpc("set_box_waybill", { p_box_id: boxId, p_waybill: no });
  if (r.error) throw new Error(`set_box_waybill 실패: ${r.error.code} ${r.error.message}`);
}

/** 크리에이터가 역조공 몫의 송장번호를 넣는다. */
export async function creatorSetsWaybill(shareId: string, no: string): Promise<void> {
  const haru = await signedInClient("haru_creator");
  const r = await haru.rpc("set_share_waybill", { p_share_id: shareId, p_waybill: no });
  if (r.error) throw new Error(`set_share_waybill 실패: ${r.error.code} ${r.error.message}`);
}

export async function approve(unit: Unit): Promise<void> {
  const r = await adminClient().rpc("approve_request", { p_request_id: unit.requestId });
  if (r.error || r.data !== "approved") throw new Error(`approve_request 실패: ${r.error?.message ?? String(r.data)}`);
}

export const FAN_PASS = { bluetooth: "clear", rf: "clear", metal: "clear", outcome: "pass" } as const;
export const SHARE_PASS = { surface: "clear", prohibited: "clear", outcome: "pass" } as const;

async function ok(p: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>, label: string): Promise<unknown> {
  const r = await p;
  if (r.error) throw new Error(`${label} 실패: ${r.error.code} ${r.error.message}`);
  return r.data;
}

/** 입고 스캔 → 라벨 부착 확인. 돌려주는 값은 내부 QR 번호. */
export async function receiveAndLabel(staff: SupabaseClient, no: string): Promise<string> {
  const scanned = (await ok(staff.rpc("office_scan_inbound", { p_waybill: no }), "office_scan_inbound")) as { qr: string };
  await ok(staff.rpc("office_confirm_label", { p_qr: scanned.qr }), "office_confirm_label");
  return scanned.qr;
}

/** 검수 기록 → 검수 스캔. 돌려주는 값은 바뀐 상태. */
export async function inspect(staff: SupabaseClient, qr: string, result: Record<string, string>): Promise<string> {
  await ok(staff.rpc("office_record_inspection", { p_qr: qr, p_result: result }), "office_record_inspection");
  return (await ok(staff.rpc("office_scan_inspect", { p_qr: qr }), "office_scan_inspect")) as string;
}

export function parcelState(qr: string): string {
  return psql(`select state from public.office_parcels where qr_code = '${qr}'`);
}

export function orderStatus(orderId: string): string {
  return psql(`select status from public.orders where id = '${orderId}'`);
}

/** 시험이 만든 미확인 입고 줄을 지운다(선반 번호 앞머리 T-). */
export function deleteTestUnmatched(): void {
  psql("delete from public.office_unmatched where shelf like 'T-%'");
  // 「내 물건 찾기」 시도 기록 — 남겨 두면 하루 실패 한도(10번)에 걸려 다음 시험이 막힌다. 로컬 DB 에만 붙는다.
  psql("delete from public.office_match_attempts");
}
