import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, approveRpc, clearWaybillAttempts, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";
import { payTestRevgift, PROFILE, registerTestRevgift } from "./revgift-helpers";

// 사무실 작업 흐름 통합 시험 공용 (office-workflow INV-W1~W8).
// 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자, byeolbit_fan = 별빛(시험 주문의 팬), haru_creator = 하루.

export type Unit = { kind: "box"; orderId: string; orderNo: string; requestId: string; boxIds: string[] };
export type ShareUnit = { kind: "share"; sendId: string; shareId: string; orderNo: string };

/** 시험마다 다른 원 송장번호(숫자 12자리). */
export function waybill(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => String(b % 10)).join("");
}

/** 결제까지 끝난 팬 선물(별빛 → 하루, creatorId 를 주면 그 크리에이터). 상자 n 개. */
export async function paidGift(boxCount = 1, creatorId?: string): Promise<Unit> {
  const o = await registerTestOrder(boxCount, creatorId ? { creatorId } : {});
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

// inbound-address-code(2026-10-07): 입고는 원 송장 바코드 + 상자별 받는 주소 6자리로 찾는다. 송장번호 등록은 배송 조회용(선택)이다.
// 시험이 「팬이 송장번호를 넣고 그 송장으로 보낸 상자」를 만들 때, 그 상자는 받는 주소(6자리)를 써서 보낸 것으로 친다 —
// 아래 표가 송장번호 → 상자를 기억해 두고, 입고 스캔이 그 상자의 6자리를 붙인다.
const waybillUnits = new Map<string, { boxId?: string; shareId?: string }>();

/** 상자(또는 몫)의 받는 주소 6자리 — 상태와 상관없이 그 상자에 발급된 값. 없으면 null. */
export function codeOf(unit: { boxId?: string; shareId?: string }): string | null {
  const where = unit.boxId ? `box_id = '${unit.boxId}'` : `share_id = '${unit.shareId}'`;
  return psql(`select code from public.inbound_codes where ${where}`) || null;
}

/** 팬이 상자 송장번호(배송 조회용)를 넣는다. 그 송장으로 온 상자는 이 상자의 6자리를 달고 온 것으로 친다. */
export async function fanSetsWaybill(boxId: string, no: string, login = "byeolbit_fan"): Promise<void> {
  const fan = await signedInClient(login);
  clearWaybillAttempts(); // 준비 단계의 등록이 하루 10번 한도에 걸리지 않게
  const r = await fan.rpc("set_box_waybill", { p_box_id: boxId, p_waybill: no });
  if (r.error || r.data !== "saved") throw new Error(`set_box_waybill 실패: ${r.error?.code ?? String(r.data)} ${r.error?.message ?? ""}`);
  if (!waybillUnits.has(no)) waybillUnits.set(no, { boxId });
}

/** 크리에이터가 역조공 몫의 송장번호를 넣는다. */
export async function creatorSetsWaybill(shareId: string, no: string): Promise<void> {
  const haru = await signedInClient("haru_creator");
  clearWaybillAttempts();
  const r = await haru.rpc("set_share_waybill", { p_share_id: shareId, p_waybill: no });
  if (r.error || r.data !== "saved") throw new Error(`set_share_waybill 실패: ${r.error?.code ?? String(r.data)} ${r.error?.message ?? ""}`);
  if (!waybillUnits.has(no)) waybillUnits.set(no, { shareId });
}

/** 송장번호를 등록하지 않고, 받는 주소(6자리)를 써서 보낸 상자 — 입고 스캔이 그 바코드에 이 상자의 6자리를 붙인다. */
export function sentWithAddress(barcode: string, unit: { boxId?: string; shareId?: string }): void {
  waybillUnits.set(barcode, unit);
}

export type ScanOptions = { code?: string | null; carrier?: string | null; initial?: string | null; shelf?: string | null };

/**
 * 입고 스캔(원 송장 바코드 + 6자리). code 를 주지 않으면 그 바코드로 보낸 상자(fanSetsWaybill·sentWithAddress)의 6자리를 붙이고,
 * 모르는 바코드면 6자리 없이 스캔한다. 보류로 넣을 때 쓰는 택배사·이름 앞 1글자·선반 번호는 opts 로.
 */
export function scanInbound(staff: SupabaseClient, barcode: string, opts: ScanOptions = {}) {
  const unit = waybillUnits.get(barcode);
  const code = opts.code !== undefined ? opts.code : unit ? codeOf(unit) : null;
  return staff.rpc("office_scan_inbound", {
    p_barcode: barcode,
    p_code: code,
    p_carrier: opts.carrier ?? null,
    p_sender_initial: opts.initial ?? null,
    p_shelf: opts.shelf ?? null,
  });
}

/** 보류로 넣을 때 직원이 적는 값(시험 선반은 T- 로 시작 — 정리할 때 이것으로 가려낸다). */
export const HOLD_DETAILS = { carrier: "cj", initial: "별", shelf: "T-1" } as const;

export async function approve(unit: Unit): Promise<void> {
  const r = await approveRpc(unit.requestId);
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
  const scanned = (await ok(scanInbound(staff, no), "office_scan_inbound")) as { qr: string };
  await ok(staff.rpc("office_confirm_label", { p_qr: scanned.qr }), "office_confirm_label");
  return scanned.qr;
}

/** 검수 기록 → 검수 스캔. 돌려주는 값은 바뀐 상태. */
export async function inspect(staff: SupabaseClient, qr: string, result: Record<string, string>): Promise<string> {
  await ok(staff.rpc("office_record_inspection", { p_qr: qr, p_result: result }), "office_record_inspection");
  // 팬 선물이 통과로 끝나려면 실측이 있어야 한다(office-workflow INV-W4 S4d) — 아직 없으면 신고 구간 그대로 잰 것으로 친다
  // 크리에이터 확인(confirm)도 받으면 그대로 출고되므로 같은 규칙이다(2026-10-12 (2) D3 ②)
  if (result.outcome === "pass" || result.outcome === "confirm") {
    const declared = psql(
      `select b.declared_tier from public.office_parcels p join public.boxes b on b.id = p.box_id where p.qr_code = '${qr}' and b.measured_tier is null`,
    );
    if (declared !== "") await ok(staff.rpc("office_record_measurement", { p_qr: qr, p_tier: declared }), "office_record_measurement");
  }
  return (await ok(staff.rpc("office_scan_inspect", { p_qr: qr }), "office_scan_inspect")) as string;
}

/**
 * 송장 출력의 DB 마무리 단계 — 상자를 「송장 출력함」으로 넘긴다. 앱은 주소를 연 뒤 주소 열기 계정으로만 이 단계를 부른다
 * (팬 선물 invoice_finish_print · 역조공 revgift_finish_print). 시험은 주소 열기 없이 DB 관리자 연결로 부른다 — 출고 조건·단계 검사는 같다.
 * 성공하면 null, 거부되면 SQLSTATE(예: P0041 출고 조건, 55000 단계).
 */
export function finishPrint(qr: string, waybillNo: string): string | null {
  const fn = psql(`select case when share_id is null then 'invoice_finish_print' else 'revgift_finish_print' end from public.office_parcels where qr_code = '${qr}'`) || "invoice_finish_print";
  const state = psql(
    `do $$ begin perform public.${fn}('${qr}', '${waybillNo}'); perform set_config('fankkuk_test.state', 'ok', false); exception when others then perform set_config('fankkuk_test.state', sqlstate, false); end $$; select current_setting('fankkuk_test.state')`,
  );
  // psql 은 DO 의 명령 꼬리표를 먼저 찍는다 — 마지막 줄이 결과다
  const last = state.split("\n").pop() ?? "";
  return last === "ok" ? null : last;
}

export function parcelState(qr: string): string {
  return psql(`select state from public.office_parcels where qr_code = '${qr}'`);
}

export function orderStatus(orderId: string): string {
  return psql(`select status from public.orders where id = '${orderId}'`);
}

/** 시험이 만든 미확인 입고(보류) 줄을 지운다(선반 번호 앞머리 T-). */
export function deleteTestUnmatched(): void {
  psql("delete from public.office_unmatched where shelf like 'T-%'");
  // 찾기 시도 기록·반복 실패 표시 — 남겨 두면 하루 한도(5번)에 걸려 다음 시험이 막힌다. 로컬 DB 에만 붙는다.
  psql("delete from public.office_match_attempts; delete from public.office_find_flags;");
  // 분쟁 끝에 주문에서 떼어 낸 상자 줄(상자·몫 어디에도 묶이지 않음) — 시드에는 없다
  const detached = "select id from public.office_parcels where box_id is null and share_id is null";
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from public.notification_outbox where parcel_id in (${detached});`,
      `delete from public.office_not_mine_reports where parcel_id in (${detached});`,
      `delete from public.office_inspections where parcel_id in (${detached});`,
      `delete from public.office_envelope_shreds where parcel_id in (${detached});`,
      `delete from public.office_label_pending where parcel_id in (${detached});`,
      `update public.inbound_codes set first_parcel_id = null where first_parcel_id in (${detached});`,
      `delete from public.office_parcels where id in (${detached});`,
      "commit;",
    ].join(" "),
  );
}
