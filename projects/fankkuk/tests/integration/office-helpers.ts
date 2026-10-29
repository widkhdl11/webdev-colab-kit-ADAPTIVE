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

export type ScanOptions = { code?: string | null; carrier?: string | null; senderName?: string | null; shelf?: string | null };

/**
 * 입고 스캔(원 송장 바코드 + 6자리). code 를 주지 않으면 그 바코드로 보낸 상자(fanSetsWaybill·sentWithAddress)의 6자리를 붙이고,
 * 모르는 바코드면 6자리 없이 스캔한다. 보류로 넣을 때 쓰는 택배사·송장 「보내는 분」 이름(inbound-address-code INV-C5 — DB 가 닉네임과 비교만 하고
 * 글자는 남기지 않는다)·선반 번호는 opts 로.
 */
export function scanInbound(staff: SupabaseClient, barcode: string, opts: ScanOptions = {}) {
  const unit = waybillUnits.get(barcode);
  const code = opts.code !== undefined ? opts.code : unit ? codeOf(unit) : null;
  return staff.rpc("office_scan_inbound", {
    p_barcode: barcode,
    p_code: code,
    p_carrier: opts.carrier ?? null,
    p_sender_name: opts.senderName ?? null,
    p_shelf: opts.shelf ?? null,
  });
}

/**
 * 보류로 넣을 때 직원이 적는 값(시험 선반은 T- 로 시작 — 정리할 때 이것으로 가려낸다).
 * 보내는 분은 시험 주문의 팬 별빛의 닉네임 — 그 상자는 별빛과 「닉네임 일치」로 기록된다(INV-C5, 카드 d94).
 */
export const HOLD_DETAILS = { carrier: "cj", senderName: "별빛", shelf: "T-1" } as const;

export async function approve(unit: Unit): Promise<void> {
  const r = await approveRpc(unit.requestId);
  if (r.error || r.data !== "approved") throw new Error(`승인 실패: ${r.error?.message ?? String(r.data)}`);
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

/**
 * 개봉 대상(office-workflow INV-W16)인가 — 그 상자를 보낸 팬에게 추적기 판정 기록이 하나라도 있으면(어느 크리에이터에게 보낸 주문이든) 팬 선물 상자는 연다.
 * DB 의 판정과 같은 조건을 시험 쪽에서 따로 센다(구현 전 빨간불에서도 돌게 DB 함수를 부르지 않는다).
 */
export function isOpenTarget(qr: string): boolean {
  return (
    psql(
      `select exists (select 1 from public.office_parcels p join public.boxes b on b.id = p.box_id join public.orders o on o.id = b.order_id
         join public.orders o2 on o2.fan_id = o.fan_id join public.boxes b2 on b2.order_id = o2.id join public.office_parcels p2 on p2.box_id = b2.id
         join public.office_inspections i on i.parcel_id = p2.id
       where p.qr_code = '${qr}' and i.tracker_verdict = 'tracker')`,
    ) === "t"
  );
}

/**
 * 검수 결과에 개봉 결과를 붙인다 — 개봉 대상이고 결과에 그 칸이 없을 때만. 판정 칸이 있으면 「장치 나옴」, 없으면 「장치 없음」으로 친다.
 * 같은 팬(별빛)이 앞 시험에서 추적기로 걸리면 그 뒤 상자가 개봉 대상이 되므로, 개봉을 보는 시험이 아닌 곳은 이 기본값으로 지나간다(W16 시험은 직접 넣는다).
 */
export function withOpened(qr: string, result: Record<string, string>): Record<string, string> {
  if ("opened" in result || !("bluetooth" in result) || !isOpenTarget(qr)) return result;
  return { ...result, opened: "tracker_verdict" in result ? "device" : "none" };
}

/** 검수 기록 → 검수 스캔. 돌려주는 값은 바뀐 상태. 개봉 대상이면 개봉 결과를 붙인다(withOpened). */
export async function inspect(staff: SupabaseClient, qr: string, given: Record<string, string>): Promise<string> {
  const result = withOpened(qr, given);
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

/**
 * 반송 송장 출력의 DB 마무리 단계(office-workflow INV-W8·W15) — 주문에 이어진 반송 대기 상자를 「반송 송장 출력함」으로 넘긴다.
 * 앱은 보낸 사람이 확인한 주소를 연 뒤 주소 열기 계정으로만 이 단계를 부른다(return_finish_print). 시험은 주소 열기 없이 DB 관리자 연결로 부른다 —
 * 확인 여부·단계 검사는 같다. 성공하면 null, 거부되면 SQLSTATE(P0041 반송 주소 확인 전·봉투를 내준 뒤 다시 확인함, 55000 단계).
 * confirmedAtSql: 봉투를 내준 순간의 확인 시각(SQL 식). 앱은 봉투 함수의 답에 실린 값을 넘긴다 — 시험은 기본으로 지금 상자에 적힌 값을 넘긴다.
 */
export function finishReturnPrint(qr: string, waybillNo: string, confirmedAtSql = returnConfirmedAtSql(qr)): string | null {
  const state = psql(
    `do $$ begin perform public.return_finish_print('${qr}', '${waybillNo}', ${confirmedAtSql}); perform set_config('fankkuk_test.state', 'ok', false); exception when others then perform set_config('fankkuk_test.state', sqlstate, false); end $$; select current_setting('fankkuk_test.state')`,
  );
  const last = state.split("\n").pop() ?? "";
  return last === "ok" ? null : last;
}

/**
 * 「제가 보낸 게 아니에요」 보류 상자를 시험용으로 만든다. 팬·크리에이터 버튼은 없앴고(2026-10-17 사용자 결정, report_not_mine 실행 권한 없음)
 * 이미 남은 보류·신고 줄과 운영자의 보류 넘기기는 그대로라, 옛 함수가 남기던 public 두 가지(신고 줄 + 보류 사유)만 넣는다.
 */
export function markNotMineForTest(target: { boxId: string } | { shareId: string }, reporterId: string): void {
  const where = "boxId" in target ? `box_id = '${target.boxId}'` : `share_id = '${target.shareId}'`;
  psql(
    `insert into public.office_not_mine_reports (parcel_id, reported_by, parcel_state) select id, '${reporterId}', state from public.office_parcels where ${where} on conflict (parcel_id) do nothing; ` +
      `update public.office_parcels set hold_reason = coalesce(hold_reason, 'not_mine'), hold_at = coalesce(hold_at, now()) where ${where}`,
  );
}

/** 그 상자에 지금 적힌 반송 주소 확인 시각을 읽는 SQL 식 — 반송 송장 마무리(return_finish_print)의 셋째 인자로 쓴다 */
export function returnConfirmedAtSql(qr: string): string {
  return `(select return_confirmed_at from public.office_parcels where qr_code = '${qr}')`;
}

/**
 * 보낸 사람이 반송 주소를 확인한 것으로 표시만 한다(확인 시각 칸) — 기한·카드·출력 단계의 갈래를 보는 시험의 준비용.
 * 등록 주소를 상자에 복사하는 실제 확인(confirm_return_address, manual/0020)은 return-address-confirm-db 가 본다.
 */
export function markReturnConfirmedForTest(qr: string): void {
  psql(`update public.office_parcels set return_confirmed_at = now() where qr_code = '${qr}'`);
}

/**
 * 출고·반송 확정 + 72시간 주소 사본 지우기(reverse-gift INV-R9 · address-protection INV-P18 · office-workflow INV-W11, 2026-10-23 카드 d120)를
 * 예약 작업 대신 한 번 돌린다. 함수는 manual/0024 가 만든다 — 적용 전에는 함수가 없어 이 호출이 실패한다(빨간불이 맞다).
 * 돌려주는 값: {revgift, return} — 이번에 지운 몫 사본 수 · 반송 상자 사본 수.
 */
export function dropAddressCopies(): { revgift: number; return: number } {
  return JSON.parse(psql("select public.office_drop_address_copies()::text")) as { revgift: number; return: number };
}

/** 몫의 출고 확정 시각을 hours 시간 앞으로 당긴다 — 72시간 사본 지우기의 시계(revgift_shares.shipped_at) */
export function ageShareShipment(orderNo: string, hours: number): void {
  psql(`update public.revgift_shares set shipped_at = shipped_at - interval '${hours} hours' where order_no = '${orderNo}'`);
}

/** 상자의 반송 확정 시각을 hours 시간 앞으로 당긴다 — 72시간 사본 지우기의 시계(office_parcels.returned_at) */
export function ageReturn(qr: string, hours: number): void {
  psql(`update public.office_parcels set returned_at = returned_at - interval '${hours} hours' where qr_code = '${qr}'`);
}

export function parcelState(qr: string): string {
  return psql(`select state from public.office_parcels where qr_code = '${qr}'`);
}

export function orderStatus(orderId: string): string {
  return psql(`select status from public.orders where id = '${orderId}'`);
}

/** 시험이 만든 미확인 입고(보류) 줄을 지운다(선반 번호 앞머리 T-). */
export function deleteTestUnmatched(): void {
  // 운영자 잇기 기록(INV-C12)은 추가만 되는 표라 트리거를 끈 채 먼저 지운다 — 표가 아직 없을 때(구현 전 빨간불)도 정리가 멈추지 않게
  psql(
    "begin; set local session_replication_role = replica; " +
      "do $$ begin if to_regclass('public.office_held_links') is not null then " +
      "delete from public.office_held_links where unmatched_id in (select id from public.office_unmatched where shelf like 'T-%'); end if; " +
      // 운영자 몫 옮기기 기록(INV-C11)도 추가만 — 표가 있을 때만
      "if to_regclass('public.office_share_moves') is not null then " +
      "delete from public.office_share_moves where unmatched_id in (select id from public.office_unmatched where shelf like 'T-%'); end if; " +
      // 물품 보관소의 포장 모양 수정 기록(추가만)·확인 요청 줄(INV-C13) — 표가 있을 때만
      "if to_regclass('public.office_unmatched_look_edits') is not null then " +
      "delete from public.office_unmatched_look_edits where unmatched_id in (select id from public.office_unmatched where shelf like 'T-%'); end if; " +
      "if to_regclass('public.office_storage_claims') is not null then " +
      "delete from public.office_storage_claims where unmatched_id in (select id from public.office_unmatched where shelf like 'T-%'); end if; end $$; commit;",
  );
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
      // 반송 주소 열람 기록(address-protection INV-P18 — 이어지지 않은 상자의 거부 줄) — 표가 있을 때만
      `do $$ begin if to_regclass('public.return_decrypt_log') is not null then delete from public.return_decrypt_log where parcel_id in (${detached}); end if; end $$;`,
      `delete from public.office_label_pending where parcel_id in (${detached});`,
      `update public.inbound_codes set first_parcel_id = null where first_parcel_id in (${detached});`,
      `delete from public.office_parcels where id in (${detached});`,
      "commit;",
    ].join(" "),
  );
}
