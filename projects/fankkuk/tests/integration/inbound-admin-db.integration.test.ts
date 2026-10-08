import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { codeOf, deleteTestUnmatched, HOLD_DETAILS, paidGift, paidShare, scanInbound, waybill } from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 받는 주소 6자리 — 운영자 도구 (docs/specs/inbound-address-code.md INV-C6·C8·C9·C10, 「측정」 절, 마이그레이션 20261007000009).
// 시드: 별빛(byeolbit_fan) = 시험 주문의 팬, 달토끼(daltokki_fan) = 다른 팬, fankkuk_staff = 직원 운영자.

let startedAt = "";
beforeAll(() => {
  startedAt = psql("select now()::text");
});

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
  // 6자리 입력 기록은 추가만 되는 표다 — 이 파일이 남긴 줄만 지운다(로컬 DB)
  psql(`begin; set local session_replication_role = replica; delete from public.office_code_inputs where at >= '${startedAt}'; commit;`);
});

type Metrics = {
  arrived_total: number;
  arrived_without_code: number;
  code_inputs: number;
  code_check_rejects: number;
  code_format_rejects: number;
  not_mine_reports: number;
};

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

async function metrics(client: SupabaseClient): Promise<Metrics> {
  const r = await client.rpc("admin_inbound_metrics");
  expect(r.error).toBeNull();
  const rows = r.data as Metrics[];
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** 6자리 없이 온 상자를 보류로 넣고 그 보류 줄 id 를 돌려준다 */
async function holdWithoutCode(client: SupabaseClient, barcode: string): Promise<string> {
  const r = await scanInbound(client, barcode, { code: null, ...HOLD_DETAILS });
  expect(r.error).toBeNull();
  expect((r.data as { result: string }).result).toBe("hold");
  return psql(`select id from public.office_unmatched where waybill_no = '${barcode}'`);
}

describe("INV-C9 반송으로 넘기기 — 운영자만, 아직 이어지지 않은 보류 상자만", () => {
  it("INV-C6·C9: 운영자가 넘기면 반송 대상(7일 자동 처리와 같은 끝)이 되고 누가 넘겼는지 남는다", async () => {
    const op = await staff();
    const barcode = waybill();
    const id = await holdWithoutCode(op, barcode);
    const r = await op.rpc("admin_return_unmatched", { p_id: id });
    expect(r.error).toBeNull();
    expect(psql(`select (expired_at is not null) || '|' || (returned_by = (select id from public.profiles where login_id = 'fankkuk_staff')) from public.office_unmatched where id = '${id}'`)).toBe("true|true");
    const list = (await op.rpc("admin_unmatched_parcels")).data as { id: string; state: string }[];
    expect(list.find((x) => x.id === id)?.state).toBe("expired");
  });

  it("INV-C9 (실패경로): 이미 반송 대상이면 55000, 없는 줄은 P0002", async () => {
    const op = await staff();
    const id = await holdWithoutCode(op, waybill());
    expect((await op.rpc("admin_return_unmatched", { p_id: id })).error).toBeNull();
    expect((await op.rpc("admin_return_unmatched", { p_id: id })).error?.code).toBe("55000");
    expect((await op.rpc("admin_return_unmatched", { p_id: "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f" })).error?.code).toBe("P0002");
  });

  it("INV-C9 (실패경로): 주인과 이미 이어진 보류 상자는 넘기지 않는다(55000)", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const barcode = waybill();
    const id = await holdWithoutCode(op, barcode);
    const fan = await signedInClient("byeolbit_fan");
    const found = await fan.rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: barcode, p_carrier: "cj", p_sender_initial: "별" });
    expect(found.data).toBe("matched");
    expect((await op.rpc("admin_return_unmatched", { p_id: id })).error?.code).toBe("55000");
  });

  it("INV-C9 (실패경로): 팬·크리에이터·손님은 넘길 수 없다 — 상태 그대로", async () => {
    const id = await holdWithoutCode(await staff(), waybill());
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      expect((await (await signedInClient(login)).rpc("admin_return_unmatched", { p_id: id })).error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_return_unmatched", { p_id: id })).error).not.toBeNull();
    expect(psql(`select expired_at is null from public.office_unmatched where id = '${id}'`)).toBe("t");
  });

  it("INV-C6·C4: 반송으로 넘긴 상자는 주인이 셋 다 맞게 넣어도 이어지지 않는다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const barcode = waybill();
    const id = await holdWithoutCode(op, barcode);
    expect((await op.rpc("admin_return_unmatched", { p_id: id })).error).toBeNull();
    const fan = await signedInClient("byeolbit_fan");
    const found = await fan.rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: barcode, p_carrier: "cj", p_sender_initial: "별" });
    expect(found.data).toBe("not_found");
  });

  it("INV-C4·C9: 반송 함수는 보류 줄 하나만 받는다 — 주문번호·상자를 받는 꼴이 없다", () => {
    const args = psql("select pg_get_function_identity_arguments('public.admin_return_unmatched'::regproc)");
    expect(args).toBe("p_id uuid");
  });
});

/** 6자리로 입고하고 라벨 부착 확인까지 — 다음 입고가 막히지 않게(INV-W2) */
async function receiveLabeled(op: SupabaseClient, boxId: string): Promise<void> {
  const r = await scanInbound(op, waybill(), { code: codeOf({ boxId }) });
  expect(r.data).toMatchObject({ result: "received" });
  const labeled = await op.rpc("office_confirm_label", { p_qr: (r.data as { qr: string }).qr });
  expect(labeled.error).toBeNull();
}

/** 6자리로 첫 상자를 입고하고, 같은 6자리로 둘째 상자를 넣어 첫 상자를 「같은 6자리 분쟁」으로 멈춘다. 돌려주는 값은 첫 상자 줄 id. */
async function disputedParcel(op: SupabaseClient): Promise<{ parcelId: string; orderId: string }> {
  const g = await paidGift();
  const code = codeOf({ boxId: g.boxIds[0] })!;
  await receiveLabeled(op, g.boxIds[0]);
  const second = await scanInbound(op, waybill(), { code, ...HOLD_DETAILS });
  if (second.error) throw new Error(`둘째 입고 실패: ${second.error.code} ${second.error.message}`);
  expect(second.data).toMatchObject({ result: "hold", reason: "code_dispute" });
  return { parcelId: psql(`select id from public.office_parcels where box_id = '${g.boxIds[0]}'`), orderId: g.orderId };
}

/** 6자리로 입고한 뒤 주인이 「제가 보낸 게 아니에요」를 누른 상자. */
async function notMineParcel(op: SupabaseClient): Promise<{ parcelId: string; orderId: string }> {
  const g = await paidGift();
  await receiveLabeled(op, g.boxIds[0]);
  const r = await (await signedInClient("byeolbit_fan")).rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null });
  expect(r.error).toBeNull();
  return { parcelId: psql(`select id from public.office_parcels where box_id = '${g.boxIds[0]}'`), orderId: g.orderId };
}

const backdateHold = (parcelId: string, hours: number) => psql(`update public.office_parcels set hold_at = now() - interval '${hours} hours' where id = '${parcelId}'`);
const closed = (parcelId: string) =>
  psql(`select (box_id is null) || '|' || (hold_closed_at is not null) from public.office_parcels where id = '${parcelId}'`);

describe("INV-C9 주문에 묶인 채 멈춘 상자의 반송 (정책 질문 12)", () => {
  it("INV-C9 (S9b): 같은 6자리 분쟁 상자는 보류 + 168시간 전에는 운영자도 넘길 수 없고, 지나면 넘겨진다 — 주문에서 떨어지고 환불은 없다", async () => {
    const op = await staff();
    const { parcelId, orderId } = await disputedParcel(op);
    backdateHold(parcelId, 167);
    expect((await op.rpc("admin_return_held_parcel", { p_id: parcelId })).error?.code).toBe("55000");
    expect(closed(parcelId)).toBe("false|false");
    backdateHold(parcelId, 168);
    expect((await op.rpc("admin_return_held_parcel", { p_id: parcelId })).error).toBeNull();
    expect(closed(parcelId)).toBe("true|true");
    expect(psql(`select hold_closed_by = (select id from public.profiles where login_id = 'fankkuk_staff') from public.office_parcels where id = '${parcelId}'`)).toBe("t");
    const list = (await op.rpc("admin_unmatched_parcels")).data as { id: string; state: string }[];
    expect(list.find((x) => x.id === parcelId)?.state).toBe("expired");
    expect(psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`)).toBe("none");
  });

  it("INV-C9: 하나뿐인 상자를 떼어 내면 주문은 「상자가 아직 오지 않음」으로 돌아간다 — 그 뒤 반려되면 전액 환불", async () => {
    const op = await staff();
    const { parcelId, orderId } = await notMineParcel(op);
    expect(psql(`select received_at is not null from public.orders where id = '${orderId}'`)).toBe("t");
    expect((await op.rpc("admin_return_held_parcel", { p_id: parcelId })).error).toBeNull();
    expect(psql(`select status || '|' || (received_at is null) || '|' || (inspected_at is null) from public.orders where id = '${orderId}'`)).toBe("registered|true|true");
    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'expired' where id = '${orderId}'; commit;`);
    expect(psql(`select public.refund_due_of_payment(p.id) = p.amount_krw from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`)).toBe("t");
  });

  it("INV-C9: 역조공 몫 상자를 떼어 내면 몫의 입고·검수 표시도 지운다", async () => {
    const op = await staff();
    const s = await paidShare();
    const r = await scanInbound(op, waybill(), { code: codeOf({ shareId: s.shareId }) });
    expect(r.data).toMatchObject({ result: "received" });
    expect(psql(`select received_at is not null from public.revgift_shares where id = '${s.shareId}'`)).toBe("t");
    const parcelId = psql(`select id from public.office_parcels where share_id = '${s.shareId}'`);
    // 몫 상자의 「아니에요」는 보낸 크리에이터가 누른다 — 여기서는 넘기기의 끝만 본다
    psql(`update public.office_parcels set hold_reason = 'not_mine', hold_at = now() where id = '${parcelId}'`);
    expect((await op.rpc("admin_return_held_parcel", { p_id: parcelId })).error).toBeNull();
    expect(psql(`select (received_at is null) || '|' || (inspected_at is null) from public.revgift_shares where id = '${s.shareId}'`)).toBe("true|true");
  });

  it("INV-C9 (S9c): 「제가 보낸 게 아니에요」 상자는 운영자가 바로 넘길 수 있다", async () => {
    const op = await staff();
    const { parcelId } = await notMineParcel(op);
    expect((await op.rpc("admin_return_held_parcel", { p_id: parcelId })).error).toBeNull();
    expect(closed(parcelId)).toBe("true|true");
  });

  it("INV-C9 (S9c): 아무도 넘기지 않으면 보류 + 168시간에 자동 처리가 넘긴다 — 167시간이면 그대로, 두 번 돌려도 한 번", async () => {
    const op = await staff();
    const mine = await notMineParcel(op);
    const dispute = await disputedParcel(op);
    backdateHold(mine.parcelId, 167);
    backdateHold(dispute.parcelId, 167);
    await op.rpc("office_run_expiry", {});
    expect(closed(mine.parcelId)).toBe("false|false");
    backdateHold(mine.parcelId, 168);
    backdateHold(dispute.parcelId, 168);
    const first = (await op.rpc("office_run_expiry", {})).data as { held_parcels: number };
    expect(first.held_parcels).toBeGreaterThanOrEqual(2);
    expect(closed(mine.parcelId)).toBe("true|true");
    expect(closed(dispute.parcelId)).toBe("true|true");
    expect(psql(`select count(*) from public.office_parcels where id in ('${mine.parcelId}', '${dispute.parcelId}') and hold_closed_by is null`)).toBe("2");
    expect(((await op.rpc("office_run_expiry", {})).data as { held_parcels: number }).held_parcels).toBe(0);
  });

  it("INV-C9 (S9d, 실패경로): 팬·크리에이터·손님은 넘길 수 없고, 이미 넘긴 상자는 55000, 보류가 아닌 상자는 55000", async () => {
    const op = await staff();
    const { parcelId } = await notMineParcel(op);
    for (const who of ["byeolbit_fan", "haru_creator"]) {
      expect((await (await signedInClient(who)).rpc("admin_return_held_parcel", { p_id: parcelId })).error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_return_held_parcel", { p_id: parcelId })).error).not.toBeNull();
    expect(closed(parcelId)).toBe("false|false");
    expect((await op.rpc("admin_return_held_parcel", { p_id: parcelId })).error).toBeNull();
    expect((await op.rpc("admin_return_held_parcel", { p_id: parcelId })).error?.code).toBe("55000");
    const g = await paidGift();
    await receiveLabeled(op, g.boxIds[0]);
    const normal = psql(`select id from public.office_parcels where box_id = '${g.boxIds[0]}'`);
    expect((await op.rpc("admin_return_held_parcel", { p_id: normal })).error?.code).toBe("55000");
    expect((await op.rpc("admin_return_held_parcel", { p_id: "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f" })).error?.code).toBe("P0002");
  });
});

describe("측정 — 6자리 입력 기록과 숫자 셋(최근 30일)", () => {
  it("입력 결과만 남기고(값은 남기지 않는다), 숫자에 그대로 더해진다", async () => {
    const op = await staff();
    const before = await metrics(op);
    for (const outcome of ["accepted", "accepted", "check", "format"]) {
      expect((await op.rpc("office_log_code_input", { p_outcome: outcome })).error).toBeNull();
    }
    const after = await metrics(op);
    expect(after.code_inputs - before.code_inputs).toBe(4);
    expect(after.code_check_rejects - before.code_check_rejects).toBe(1);
    expect(after.code_format_rejects - before.code_format_rejects).toBe(1);
    // 표에 6자리 칸이 없다
    expect(psql("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'office_code_inputs' and column_name ~ 'code'")).toBe("0");
  });

  it("(실패경로) 운영자가 아니면 기록 42501, 모르는 결과 값은 22023", async () => {
    expect((await (await signedInClient("byeolbit_fan")).rpc("office_log_code_input", { p_outcome: "accepted" })).error?.code).toBe("42501");
    expect((await (await staff()).rpc("office_log_code_input", { p_outcome: "K7M3XA" })).error?.code).toBe("22023");
  });

  it("(실패경로) 기록은 고치거나 지울 수 없다", async () => {
    const op = await staff();
    expect((await op.rpc("office_log_code_input", { p_outcome: "check" })).error).toBeNull();
    const id = psql(`select max(id) from public.office_code_inputs where at >= '${startedAt}'`);
    expect(() => psql(`update public.office_code_inputs set outcome = 'accepted' where id = ${id}`)).toThrow();
    expect(() => psql(`delete from public.office_code_inputs where id = ${id}`)).toThrow();
  });

  it("6자리 없이 들어온 상자·들어온 상자·「제가 보낸 게 아니에요」가 숫자에 더해진다", async () => {
    const op = await staff();
    const before = await metrics(op);
    await holdWithoutCode(op, waybill());
    const g = await paidGift(1);
    const r = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0] }) });
    expect((r.data as { result: string }).result).toBe("received");
    await op.rpc("office_confirm_label", { p_qr: (r.data as { qr: string }).qr });
    expect((await (await signedInClient("byeolbit_fan")).rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null })).error).toBeNull();
    const after = await metrics(op);
    expect(after.arrived_total - before.arrived_total).toBe(2);
    expect(after.arrived_without_code - before.arrived_without_code).toBe(1);
    expect(after.not_mine_reports - before.not_mine_reports).toBe(1);
  });

  it("(실패경로) 팬·크리에이터·손님에게는 숫자가 0줄", async () => {
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const r = await (await signedInClient(login)).rpc("admin_inbound_metrics");
      expect(r.data ?? []).toHaveLength(0);
    }
    const anon = await anonClient().rpc("admin_inbound_metrics");
    expect(anon.data ?? []).toHaveLength(0);
  });
});

describe("INV-C8 상자 읽기 — 「제가 보낸 게 아니에요」를 눌렀는지는 주인에게만", () => {
  it("INV-C8: 누르기 전 false, 누른 뒤 true. 다른 팬에게는 상자 자체가 없다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const r = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0] }) });
    await op.rpc("office_confirm_label", { p_qr: (r.data as { qr: string }).qr });
    const fan = await signedInClient("byeolbit_fan");
    const read = async () => ((await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data as { reported_not_mine: boolean; address_code: string | null }[])[0];
    expect((await read()).reported_not_mine).toBe(false);
    // 입고되면 6자리는 사용됨 — 더는 주소로 보이지 않는다(INV-C2·C5)
    expect((await read()).address_code).toBeNull();
    expect((await fan.rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null })).error).toBeNull();
    expect((await read()).reported_not_mine).toBe(true);
    const other = await (await signedInClient("daltokki_fan")).rpc("my_gift_boxes", { p_order_no: g.orderNo });
    expect(other.data).toEqual([]);
  });

  it("INV-C10: 팬·크리에이터 상자 읽기에 보류 목록 칸(도착일·발신인)이 없다", () => {
    for (const fn of ["my_gift_boxes", "my_share_boxes"]) {
      const cols = psql(`select pg_get_function_result('public.${fn}'::regproc)`);
      expect(cols).not.toMatch(/sender_initial|shelf|arrived_at|carrier/);
    }
  });
});
