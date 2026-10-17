import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { deleteTestOrders, psql, psqlError, registerTestOrder, payTestOrder, SEED, signedInClient } from "./helpers";
import {
  codeOf,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  finishReturnPrint,
  inspect,
  markNotMineForTest,
  markReturnConfirmedForTest,
  paidGift,
  paidShare,
  parcelState,
  receiveAndLabel,
  returnConfirmedAtSql,
  scanInbound,
  waybill,
  type Unit,
} from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 반송 주소 확인 — 개인정보 구역(manual/0020)이 없어도 도는 쪽.
// 스펙: office-workflow INV-W15·W8 (S15b·S15c·S15d·S15f), notifications INV-N22·N13 (S22·S22b·S13g), action-center INV-J1·J3·J5 (S1d), payment INV-M8.
// 등록 주소를 상자에 복사하는 확인·복호화·동시 처리(S15·S15e·S18~S18c)는 return-address-confirm-db 에 있다(manual/0020 적용 뒤에 돈다).
// 여기서 「확인한 상자」가 필요한 시험은 확인 표시 칸만 직접 채운다(markReturnConfirmedForTest) — 복사 자체를 보는 시험이 아니다.
// 시드: 하루(haru_creator) = 크리에이터, 별빛(byeolbit_fan) = 보낸 팬, 모모(momo_creator) = 팬 선물을 보내는 크리에이터, fankkuk_staff = 직원.

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

const HARU = SEED.creatorProfileId;
const BYEOLBIT = SEED.fanId;
const MOMO = "00000000-0000-4000-a000-000000000012";
const RETURN_FAIL = { ...FAN_PASS, outcome: "return" } as const;
const CONFIRM = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" } as const;

const staff = (): Promise<SupabaseClient> => signedInClient("fankkuk_staff");

/** 상자 n 개 주문 — 모두 입고·라벨 부착. 돌려주는 qrs 는 상자 순서 */
async function arrived(n = 1, senderId?: string): Promise<{ g: Unit; qrs: string[] }> {
  const g = senderId ? await creatorSentGift(n, senderId) : await paidGift(n);
  const op = await staff();
  const qrs: string[] = [];
  for (const boxId of g.boxIds) {
    const no = waybill();
    await fanSetsWaybill(boxId, no, senderId ? "momo_creator" : "byeolbit_fan");
    qrs.push(await receiveAndLabel(op, no));
  }
  return { g, qrs };
}

/** 크리에이터 계정(모모)이 하루에게 보낸 팬 선물(action-center INV-J3) */
async function creatorSentGift(n: number, senderId: string): Promise<Unit> {
  const o = await registerTestOrder(n, { senderId });
  const requestId = await payTestOrder(o);
  const boxIds = psql(`select string_agg(id::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}'`).split(",");
  return { kind: "box", orderId: o.orderId, orderNo: o.orderNo, requestId, boxIds };
}

/** 검수에서 반송으로 기록해 반송 대기로 넘긴 상자 n 개 */
async function returnWaitingGift(n = 1, senderId?: string): Promise<{ g: Unit; qrs: string[] }> {
  const a = await arrived(n, senderId);
  const op = await staff();
  for (const qr of a.qrs) expect(await inspect(op, qr, RETURN_FAIL)).toBe("return_waiting");
  return a;
}

/** 하루 → 별빛 역조공 몫 하나를 입고·라벨 부착 뒤 검수에서 반송(겉면 이상) — 반송 대기 */
async function returnWaitingShare(): Promise<{ orderNo: string; qr: string; parcelId: string }> {
  const s = await paidShare();
  const op = await staff();
  const scanned = await scanInbound(op, waybill(), { code: codeOf({ shareId: s.shareId }) });
  if (scanned.error) throw new Error(`office_scan_inbound 실패: ${scanned.error.code}`);
  const qr = (scanned.data as { qr: string }).qr;
  const labeled = await op.rpc("office_confirm_label", { p_qr: qr });
  if (labeled.error) throw new Error(`office_confirm_label 실패: ${labeled.error.code}`);
  expect(await inspect(op, qr, { surface: "found", prohibited: "clear", outcome: "return" })).toBe("return_waiting");
  return { orderNo: s.orderNo, qr, parcelId: psql(`select id from public.office_parcels where qr_code = '${qr}'`) };
}

/** 주문에서 떼어 낸 상자(어느 주문에도 이어지지 않음)를 반송 대기로 둔다 — 보류 「제가 보낸 게 아니에요」 → 운영자가 넘김 */
async function detachedReturnWaiting(): Promise<{ qr: string; parcelId: string }> {
  const { g, qrs } = await arrived(1);
  markNotMineForTest({ boxId: g.boxIds[0]! }, SEED.fanId);
  const parcelId = psql(`select id from public.office_parcels where qr_code = '${qrs[0]}'`);
  const back = await (await staff()).rpc("admin_return_held_parcel", { p_id: parcelId });
  if (back.error) throw new Error(`admin_return_held_parcel 실패: ${back.error.code}`);
  // 떼어 낸 상자가 반송 대기로 가는 처리는 보류 반송 쪽이 맡는다 — 여기서는 그 결과 상태만 만든다(알림 트리거는 그대로 돈다)
  psql(`update public.office_parcels set state = 'return_waiting' where id = '${parcelId}'`);
  return { qr: qrs[0]!, parcelId };
}

/** 그 주문의 반송 주소 알림 줄(이메일) 수 — 받는 계정·종류별 */
const orderNotices = (orderId: string, kind: string, account: string) =>
  psql(`select count(*) from public.notification_outbox where order_id = '${orderId}' and kind = '${kind}' and account_id = '${account}' and channel = 'email'`);
/** 상자 하나를 가리키는 반송 주소 알림 줄(이메일) 수 */
const parcelNotices = (parcelId: string, kind: string, account?: string) =>
  psql(
    `select count(*) from public.notification_outbox where parcel_id = '${parcelId}' and kind = '${kind}' and channel = 'email'${account ? ` and account_id = '${account}'` : ""}`,
  );
const parcelIdOf = (qr: string) => psql(`select id from public.office_parcels where qr_code = '${qr}'`);
const backdateReturnWaiting = (qr: string, interval: string) =>
  psql(`update public.office_parcels set return_waiting_at = now() - interval '${interval}' where qr_code = '${qr}'`);
async function runExpiry(orderNo: string): Promise<Record<string, number>> {
  const r = await (await staff()).rpc("office_run_expiry", { p_order_no: orderNo });
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Record<string, number>;
}
const refundDue = (orderId: string) =>
  psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);
const decline = async (g: Unit) => {
  const r = await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false });
  if (r.error) throw new Error(`decline_gift 실패: ${r.error.code} ${r.error.message}`);
};
const dispose = async (qr: string, login = "fankkuk_staff") => (await signedInClient(login)).rpc("office_record_disposal", { p_qr: qr });

describe("반송 주소 알림 (notifications INV-N22)", () => {
  it("INV-N22 (S22): 하루가 거절해 두 상자가 한 처리에서 반송 대기 → 별빛 몫 return_address 1줄(주문 단위), 하루 몫 없음, 두 상자 모두 반송 대기 시각이 적힌다", async () => {
    const { g, qrs } = await arrived(2);
    const op = await staff();
    for (const qr of qrs) expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
    await decline(g);
    expect(qrs.map(parcelState)).toEqual(["return_waiting", "return_waiting"]);
    expect(orderNotices(g.orderId, "return_address", BYEOLBIT)).toBe("1");
    expect(orderNotices(g.orderId, "return_address", HARU)).toBe("0");
    expect(psql(`select count(*) from public.office_parcels p join public.boxes b on b.id = p.box_id where b.order_id = '${g.orderId}' and p.return_waiting_at is not null`)).toBe("2");
    // 꼭 가는 알림(INV-N6 표)
    expect(psql("select public.notification_kind_must_deliver('return_address') and public.notification_kind_must_deliver('return_address_reminder')")).toBe("t");
  });

  it("INV-N22: 반송 대기가 되는 처리마다 — 검수에서 첫 상자가 반송 대기로 가면 1줄, 뒤에 둘째 상자가 따로 가면 1줄 더", async () => {
    const { g, qrs } = await arrived(2);
    const op = await staff();
    expect(await inspect(op, qrs[0]!, RETURN_FAIL)).toBe("return_waiting");
    expect(orderNotices(g.orderId, "return_address", BYEOLBIT)).toBe("1");
    expect(await inspect(op, qrs[1]!, RETURN_FAIL)).toBe("return_waiting");
    expect(orderNotices(g.orderId, "return_address", BYEOLBIT)).toBe("2");
  });

  it("INV-N22 · N13 (실패경로): 같은 처리에서 돌려보낼 상자(hold_fan)가 가면 return_address 는 따로 가지 않는다 — 크리에이터 확인 거절 처리", async () => {
    const { g, qrs } = await arrived(1);
    const op = await staff();
    expect(await inspect(op, qrs[0]!, CONFIRM)).toBe("held");
    expect((await (await signedInClient("haru_creator")).rpc("choose_creator_check", { p_order_no: g.orderNo, p_box_seq: 1, p_choice: "return" })).data).toBe("chosen");
    expect((await op.rpc("office_process_creator_check", { p_qr: qrs[0], p_seen_choice: "return" })).data).toBe("returned");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(orderNotices(g.orderId, "hold_fan", BYEOLBIT)).toBe("1");
    expect(orderNotices(g.orderId, "return_address", BYEOLBIT)).toBe("0");
  });

  it("INV-N22: 역조공 몫 상자가 반송 대기 → 보낸 크리에이터(하루)에게 return_address 1줄, 받는 팬(별빛)에게는 없다", async () => {
    const s = await returnWaitingShare();
    expect(parcelNotices(s.parcelId, "return_address", HARU)).toBe("1");
    expect(parcelNotices(s.parcelId, "return_address", BYEOLBIT)).toBe("0");
  });

  it("INV-N22 (실패경로): 알림은 처리가 끝날 때의 상태로 정한다 — 같은 처리 안에서 반송 대기를 지나 다른 단계로 넘어간 상자에는 가지 않는다", async () => {
    const { g, qrs } = await arrived(1);
    const op = await staff();
    expect(await inspect(op, qrs[0]!, FAN_PASS)).toBe("inspected");
    psql(
      `begin; update public.office_parcels set state = 'return_waiting' where qr_code = '${qrs[0]}'; update public.office_parcels set state = 'return_printed', return_waybill_no = '${waybill()}' where qr_code = '${qrs[0]}'; commit;`,
    );
    expect(orderNotices(g.orderId, "return_address", BYEOLBIT)).toBe("0");
    // 같은 꼴에서 반송 대기로 끝나면 간다(위 거부가 「아무 때나 안 간다」가 아니다)
    const other = await arrived(1);
    expect(await inspect(op, other.qrs[0]!, FAN_PASS)).toBe("inspected");
    psql(`begin; update public.office_parcels set state = 'return_waiting' where qr_code = '${other.qrs[0]}'; commit;`);
    expect(orderNotices(other.g.orderId, "return_address", BYEOLBIT)).toBe("1");
  });

  it("INV-N22 (S22b): 어느 주문에도 이어지지 않은 상자가 반송 대기 → return_address 줄이 없다", async () => {
    const d = await detachedReturnWaiting();
    expect(psql(`select count(*) from public.notification_outbox where parcel_id = '${d.parcelId}' and kind like 'return_address%'`)).toBe("0");
  });
});

describe("반송 주소 기한 (office-workflow INV-W15 S15c, notifications INV-N22)", () => {
  it("INV-W15 · N22 (S15c·S22): 335시간 알림 없음, 336시간 재알림 상자마다 1(두 번 돌려도 1), 719시간 그대로, 720시간 처분 대상(다시 돌려도 그대로·재알림 늘지 않음)", async () => {
    const { g, qrs } = await returnWaitingGift(2);
    for (const qr of qrs) backdateReturnWaiting(qr, "335 hours");
    await runExpiry(g.orderNo);
    expect(orderNotices(g.orderId, "return_address_reminder", BYEOLBIT)).toBe("0");
    for (const qr of qrs) backdateReturnWaiting(qr, "336 hours");
    await runExpiry(g.orderNo);
    await runExpiry(g.orderNo);
    expect(qrs.map((qr) => parcelNotices(parcelIdOf(qr), "return_address_reminder", BYEOLBIT))).toEqual(["1", "1"]);
    for (const qr of qrs) backdateReturnWaiting(qr, "719 hours");
    await runExpiry(g.orderNo);
    expect(qrs.map(parcelState)).toEqual(["return_waiting", "return_waiting"]);
    for (const qr of qrs) backdateReturnWaiting(qr, "720 hours");
    const counts = await runExpiry(g.orderNo);
    expect(counts.dispose_due).toBe(2);
    expect(qrs.map(parcelState)).toEqual(["dispose_due", "dispose_due"]);
    expect((await runExpiry(g.orderNo)).dispose_due).toBe(0);
    expect(qrs.map(parcelState)).toEqual(["dispose_due", "dispose_due"]);
    expect(orderNotices(g.orderId, "return_address_reminder", BYEOLBIT)).toBe("2");
  });

  it("INV-W15 · N22 (실패경로): 반송 주소를 확인한 상자에는 재알림도 처분 대상도 없다", async () => {
    const { g, qrs } = await returnWaitingGift(2);
    markReturnConfirmedForTest(qrs[0]!);
    for (const qr of qrs) backdateReturnWaiting(qr, "721 hours");
    await runExpiry(g.orderNo);
    expect(qrs.map(parcelState)).toEqual(["return_waiting", "dispose_due"]);
    expect(parcelNotices(parcelIdOf(qrs[0]!), "return_address_reminder")).toBe("0");
  });

  it("INV-W15 (실패경로): 어느 주문에도 이어지지 않은 상자는 기한이 없다 — 720시간이 지나도 재알림·처분 대상 없이 반송 대기", async () => {
    const d = await detachedReturnWaiting();
    psql(`update public.office_parcels set return_waiting_at = now() - interval '800 hours' where id = '${d.parcelId}'`);
    await (await staff()).rpc("office_run_expiry", {});
    expect(parcelState(d.qr)).toBe("return_waiting");
    expect(psql(`select count(*) from public.notification_outbox where parcel_id = '${d.parcelId}' and kind like 'return_address%'`)).toBe("0");
  });

  it("INV-W15 (S15d · payment INV-M8): 처분 대상 상자를 운영자가 QR 로 처분 기록 → 처분(끝), 처분 기록 1·봉투 파쇄 1, 환불 금액은 그대로", async () => {
    const { g, qrs } = await arrived(1);
    const op = await staff();
    expect(await inspect(op, qrs[0]!, FAN_PASS)).toBe("inspected");
    await decline(g);
    backdateReturnWaiting(qrs[0]!, "720 hours");
    await runExpiry(g.orderNo);
    expect(parcelState(qrs[0]!)).toBe("dispose_due");
    const before = refundDue(g.orderId);
    const status = psql(`select status || '|' || coalesce(inspection_result, '-') from public.orders where id = '${g.orderId}'`);

    const r = await dispose(qrs[0]!);
    expect(r.error).toBeNull();
    expect(r.data).toBe("disposed");
    expect(parcelState(qrs[0]!)).toBe("disposed");
    const pid = parcelIdOf(qrs[0]!);
    expect(psql(`select count(*) || '|' || bool_and(disposed_by = (select id from public.profiles where login_id = 'fankkuk_staff')) from public.office_disposals where parcel_id = '${pid}'`)).toBe("1|true");
    expect(psql(`select count(*) from public.office_envelope_shreds where parcel_id = '${pid}'`)).toBe("1");
    expect(refundDue(g.orderId)).toBe(before);
    expect(psql(`select status || '|' || coalesce(inspection_result, '-') from public.orders where id = '${g.orderId}'`)).toBe(status);
    // 처분은 끝 — 두 번 기록하지 않는다, 기록은 고치거나 지울 수 없다
    expect((await dispose(qrs[0]!)).error?.code).toBe("55000");
    expect(psqlError(`update public.office_disposals set at = now() where parcel_id = '${pid}'`)).not.toBeNull();
    expect(psqlError(`delete from public.office_disposals where parcel_id = '${pid}'`)).not.toBeNull();
  });

  it("INV-W15 · payment INV-M8: 진행 중 주문의 검수 반송 상자가 처분 대상·처분이 돼도 주문의 검수 결과는 「반송」 그대로 — 다른 상자는 출고 단계를 그대로 간다", async () => {
    const { g, qrs } = await arrived(2);
    const op = await staff();
    expect(await inspect(op, qrs[0]!, RETURN_FAIL)).toBe("return_waiting");
    expect(await inspect(op, qrs[1]!, FAN_PASS)).toBe("inspected");
    const orderRow = () => psql(`select status || '|' || coalesce(inspection_result, '-') from public.orders where id = '${g.orderId}'`);
    expect(orderRow()).toBe("inspected|returned");
    backdateReturnWaiting(qrs[0]!, "720 hours");
    await runExpiry(g.orderNo);
    expect(parcelState(qrs[0]!)).toBe("dispose_due");
    expect(orderRow()).toBe("inspected|returned");
    expect((await dispose(qrs[0]!)).data).toBe("disposed");
    expect(orderRow()).toBe("inspected|returned");
    expect(parcelState(qrs[1]!)).toBe("inspected");
  });

  it("INV-W15 (실패경로): 처분 대상이 아닌 상자의 처분 기록 → 55000, 운영자가 아닌 계정 → 42501, 처분 대상 상자의 반송 송장 → 거부", async () => {
    const { g, qrs } = await returnWaitingGift(1);
    expect((await dispose(qrs[0]!)).error?.code).toBe("55000");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    backdateReturnWaiting(qrs[0]!, "720 hours");
    await runExpiry(g.orderNo);
    expect((await dispose(qrs[0]!, "byeolbit_fan")).error?.code).toBe("42501");
    expect((await dispose(qrs[0]!, "haru_creator")).error?.code).toBe("42501");
    expect(parcelState(qrs[0]!)).toBe("dispose_due");
    expect((await (await staff()).rpc("office_print_return_label", { p_qr: qrs[0], p_waybill: waybill() })).error?.code).toBe("55000");
    expect(finishReturnPrint(qrs[0]!, waybill())).toBe("55000");
    expect(parcelState(qrs[0]!)).toBe("dispose_due");
  });
});

describe("반송 송장 (office-workflow INV-W8·W15)", () => {
  it("INV-W8 · W15 (S15b): 주문에 이어진 반송 대기 상자는 봉투 번호 길로 출력할 수 없고, 확인하지 않았으면 등록 주소 길(마무리)도 거부", async () => {
    const { qrs } = await returnWaitingGift(1);
    const op = await staff();
    expect((await op.rpc("office_print_return_label", { p_qr: qrs[0], p_waybill: waybill() })).error?.code).toBe("55000");
    expect(finishReturnPrint(qrs[0]!, waybill())).toBe("P0041");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
  });

  it("INV-W15 (S15f): 어느 주문에도 이어지지 않은 상자는 확인 없이 봉투 번호로 반송 송장이 나온다", async () => {
    const d = await detachedReturnWaiting();
    const r = await (await staff()).rpc("office_print_return_label", { p_qr: d.qr, p_waybill: waybill() });
    expect(r.error).toBeNull();
    expect(r.data).toBe(d.qr);
    expect(parcelState(d.qr)).toBe("return_printed");
  });

  it("INV-W8: 확인한 상자는 등록 주소 길의 마무리로 반송 송장 출력 단계로 넘어가고(다시 부르면 처음 송장번호), 반송 확정 때 봉투 파쇄 1", async () => {
    const { qrs } = await returnWaitingGift(1);
    markReturnConfirmedForTest(qrs[0]!);
    const back = waybill();
    expect(finishReturnPrint(qrs[0]!, back)).toBeNull();
    expect(parcelState(qrs[0]!)).toBe("return_printed");
    expect(psql(`select (public.return_finish_print('${qrs[0]}', null, ${returnConfirmedAtSql(qrs[0]!)}) ->> 'waybill') || '|' || (public.return_finish_print('${qrs[0]}', null, ${returnConfirmedAtSql(qrs[0]!)}) ->> 'first')`)).toBe(`${back}|false`);
    const op = await staff();
    expect((await op.rpc("office_confirm_return", { p_qr: qrs[0], p_waybill: back })).error).toBeNull();
    expect(parcelState(qrs[0]!)).toBe("returned");
    expect(psql(`select count(*) from public.office_envelope_shreds where parcel_id = '${parcelIdOf(qrs[0]!)}'`)).toBe("1");
  });
});

describe("처리할 일 (action-center INV-J1·J3·J5)", () => {
  type FanCard = { kind: string; order_no: string; box_seq: number | null; due_at: string };
  type CreatorLine = { kind: string; board: string; order_no: string; box_seq: number | null; share_id: string | null };

  it("INV-J1 (S1d): 반송 대기 상자 셋(하나는 확인함, 하나는 720시간 지남) → 별빛의 「반송 주소 확인」 카드 1(기한 = 반송 대기 + 720시간), 하루로 읽으면 없다", async () => {
    const { g, qrs } = await returnWaitingGift(3);
    markReturnConfirmedForTest(qrs[1]!);
    backdateReturnWaiting(qrs[2]!, "721 hours");
    const cards = ((await (await signedInClient("byeolbit_fan")).rpc("my_action_items")).data as FanCard[]).filter((c) => c.order_no === g.orderNo);
    expect(cards.map((c) => [c.kind, c.box_seq])).toEqual([["return_address", 1]]);
    const due = psql(`select (return_waiting_at + interval '720 hours') = '${cards[0]!.due_at}'::timestamptz from public.office_parcels where qr_code = '${qrs[0]}'`);
    expect(due).toBe("t");
    const haru = await signedInClient("haru_creator");
    expect(((await haru.rpc("my_action_items")).data as FanCard[]).filter((c) => c.order_no === g.orderNo)).toEqual([]);
    expect(((await haru.rpc("my_creator_action_items")).data as CreatorLine[]).filter((c) => c.order_no === g.orderNo)).toEqual([]);
  });

  it("INV-J5: 보낸 역조공 몫 상자가 반송 대기 → 하루의 보낸 선물 판에 반송 주소 줄 1, 받는 팬(별빛)의 처리할 일에는 없다", async () => {
    const s = await returnWaitingShare();
    const lines = ((await (await signedInClient("haru_creator")).rpc("my_creator_action_items")).data as CreatorLine[]).filter((c) => c.order_no === s.orderNo);
    expect(lines.map((l) => [l.kind, l.board])).toEqual([["return_address", "sent"]]);
    expect(lines[0]!.share_id).not.toBeNull();
    // 확인한 몫 상자는 줄이 없다(확인 함수와 같은 판정)
    markReturnConfirmedForTest(s.qr);
    const after = ((await (await signedInClient("haru_creator")).rpc("my_creator_action_items")).data as CreatorLine[]).filter((c) => c.order_no === s.orderNo);
    expect(after).toEqual([]);
    // 받는 팬에게는 그 몫의 「역조공 받기」 카드만 있을 수 있다 — 반송 주소 카드는 없다
    const fan = ((await (await signedInClient("byeolbit_fan")).rpc("my_action_items")).data as FanCard[]).filter((c) => c.order_no === s.orderNo && c.kind === "return_address");
    expect(fan).toEqual([]);
  });

  it("INV-J3: 크리에이터 계정(모모)이 보낸 팬 선물의 반송 대기 상자 → 모모의 보낸 선물 판에 반송 주소 줄(상자), 받는 하루에게는 없다", async () => {
    const { g } = await returnWaitingGift(1, MOMO);
    const momo = ((await (await signedInClient("momo_creator")).rpc("my_creator_action_items")).data as CreatorLine[]).filter((c) => c.order_no === g.orderNo);
    expect(momo.map((l) => [l.kind, l.board, l.box_seq])).toEqual([["return_address", "sent", 1]]);
    expect(orderNotices(g.orderId, "return_address", MOMO)).toBe("1");
    const haru = ((await (await signedInClient("haru_creator")).rpc("my_creator_action_items")).data as CreatorLine[]).filter((c) => c.order_no === g.orderNo);
    expect(haru).toEqual([]);
  });
});
