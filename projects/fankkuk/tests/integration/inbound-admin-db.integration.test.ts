import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { codeOf, deleteTestUnmatched, HOLD_DETAILS, paidGift, scanInbound, waybill } from "./office-helpers";
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
