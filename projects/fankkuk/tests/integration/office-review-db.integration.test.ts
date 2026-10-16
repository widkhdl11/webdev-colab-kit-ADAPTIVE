import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { adminClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import {
  approve,
  codeOf,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  HOLD_DETAILS,
  inspect,
  orderStatus,
  paidGift,
  parcelState,
  receiveAndLabel,
  scanInbound,
  waybill,
  finishPrint,
} from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 사무실 작업 흐름 — 리뷰 넷이 찾은 갈래 (office-workflow INV-W1·W4·W5·W6).

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

async function labeledGift(boxCount = 1) {
  const g = await paidGift(boxCount);
  const nos = g.boxIds.map(() => waybill());
  for (const [i, id] of g.boxIds.entries()) await fanSetsWaybill(id, nos[i]);
  const staff = await signedInClient("fankkuk_staff");
  const qrs: string[] = [];
  for (const no of nos) qrs.push(await receiveAndLabel(staff, no));
  return { g, staff, qrs };
}

describe("검수 기록은 한 번 (INV-W4)", () => {
  it("INV-W4 (실패경로): 같은 상자에 두 번째 검수 기록을 쓰면 거부 — 통과 뒤에 반송으로 결론을 바꿀 수 없다", async () => {
    const { staff, qrs } = await labeledGift();
    await staff.rpc("office_record_inspection", { p_qr: qrs[0], p_result: FAN_PASS });
    const second = await staff.rpc("office_record_inspection", { p_qr: qrs[0], p_result: { ...FAN_PASS, outcome: "return" } });
    expect(second.error?.code).toBe("55000");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qrs[0]}'`)).toBe("1");
    await staff.rpc("office_record_measurement", { p_qr: qrs[0], p_tier: "small" }); // 통과는 실측이 있어야 한다(S4d)
    expect((await staff.rpc("office_scan_inspect", { p_qr: qrs[0] })).data).toBe("inspected");
  });

  it("INV-W4 (실패경로): 라벨 부착 확인 전(입고 완료) 상자에는 검수 기록을 쓸 수 없다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = ((await scanInbound(staff, no)).data as { qr: string }).qr;
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: FAN_PASS })).error?.code).toBe("55000");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qr}'`)).toBe("0");
  });

  it.each([
    ["팬 선물 칸이 빈값", { bluetooth: null, rf: null, metal: null, outcome: "pass" }],
    ["한 칸만 빈값", { bluetooth: "clear", rf: null, metal: "clear", outcome: "pass" }],
  ])("INV-W4 (실패경로): %s → 기록 거부", async (_label, result) => {
    const { staff, qrs } = await labeledGift();
    expect((await staff.rpc("office_record_inspection", { p_qr: qrs[0], p_result: result })).error?.code).toBe("22023");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qrs[0]}'`)).toBe("0");
  });

  it("INV-W4 (실패경로): 표에도 빈칸 검수는 들어가지 않는다", async () => {
    const { qrs } = await labeledGift();
    let err = "";
    try {
      psql(
        `insert into public.office_inspections (parcel_id, inspected_by, outcome) select id, '00000000-0000-4000-a000-000000000022', 'pass' from public.office_parcels where qr_code = '${qrs[0]}'`,
      );
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(err).toMatch(/check constraint/);
  });
});

describe("미확인 입고 (INV-W5)", () => {
  // inbound-address-code(2026-10-07): 보류 기록은 입고 스캔이 그 자리에서 한다. 찾기 한도는 「그날(서울 날짜) 틀린 시도 5번」(INV-C10, 카드 d92) —
  // 옛 「실패 10번」 시험 둘을 새 한도로 바꿨다.
  const find = (c: SupabaseClient, boxId: string, no: string) =>
    c.rpc("find_held_parcel", { p_box_id: boxId, p_share_id: null, p_waybill: no, p_carrier: "cj" });

  it("INV-W5 · INV-C4 (실패경로): 팬이 등록한 송장번호와 같은 바코드라도 6자리 없이 오면 그 상자로 입고되지 않고 보류", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const r = await scanInbound(staff, no, { code: null, ...HOLD_DETAILS, shelf: "T-R1" });
    expect(r.data).toMatchObject({ result: "hold", reason: "no_code" });
    expect(psql(`select state from public.office_parcels where box_id = '${g.boxIds[0]}'`)).toBe("awaiting");
  });

  it("INV-W5: 이미 보류로 기록한 바코드를 다시 스캔하면 「기록됨」, 줄은 하나", async () => {
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-R2" });
    expect(((await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-R3" })).data as { result: string }).result).toBe("hold_recorded");
    expect(psql(`select count(*) from public.office_unmatched where waybill_no = '${no}'`)).toBe("1");
  });

  it("INV-C10 (실패경로): 찾기는 하루 5번까지 — 6번째는 맞는 번호여도 거부", async () => {
    const g = await paidGift();
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-R4" });
    const fan = await signedInClient("byeolbit_fan");
    for (let i = 0; i < 5; i++) expect((await find(fan, g.boxIds[0], waybill())).data).toBe("not_found");
    expect((await find(fan, g.boxIds[0], no)).error?.code).toBe("P0045");
    expect(psql(`select matched_parcel_id is null from public.office_unmatched where waybill_no = '${no}'`)).toBe("t");
  });

  it("INV-C10: 실패가 4번이면 5번째는 찾을 수 있다", async () => {
    const g = await paidGift();
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-R5" });
    const fan = await signedInClient("byeolbit_fan");
    for (let i = 0; i < 4; i++) await find(fan, g.boxIds[0], waybill());
    expect((await find(fan, g.boxIds[0], no)).data).toBe("matched");
  });
});

describe("주문 상태 맞추기 (INV-W1)", () => {
  it("INV-W1·W4·W14: 추적기 보관 상자는 주문 계산에서 다른 검수 반송과 같다 — 승인된 주문은 나머지 상자가 출고되고, 주문은 보관이 끝나기 전까지 출고로 가지 않는다", async () => {
    const { g, staff, qrs } = await labeledGift(2);
    await approve(g);
    expect(await inspect(staff, qrs[0], { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" })).toBe("tracker_held");
    expect(await inspect(staff, qrs[1], FAN_PASS)).toBe("inspected");
    const out = waybill();
    expect(finishPrint(qrs[1], out)).toBeNull();
    await staff.rpc("office_confirm_shipment", { p_qr: qrs[1], p_waybill: out });
    expect(orderStatus(g.orderId)).toBe("inspected");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("returned");
  });

  it("INV-W4 (실패경로): 승인 전 주문의 상자가 추적기 보관이 되면 다른 검수 반송처럼 그 주문은 더 승인할 수 없다", async () => {
    const { g, staff, qrs } = await labeledGift(2);
    expect(await inspect(staff, qrs[0], { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" })).toBe("tracker_held");
    expect(await inspect(staff, qrs[1], FAN_PASS)).toBe("inspected");
    await expect(approve(g)).rejects.toThrow(/not_approvable/);
  });

  it("INV-W1: 상자 줄 없이 이미 앞 단계에 있던 주문은 상자 하나를 스캔해도 뒤로 가지 않는다", async () => {
    const g = await paidGift(2);
    psql(`update public.orders set status = 'inspected', received_at = now(), inspected_at = now(), inspection_result = 'passed' where id = '${g.orderId}'`);
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no);
    expect(orderStatus(g.orderId)).toBe("inspected");
  });

  // inbound-address-code INV-C3·C6(2026-10-07): 반려된 주문의 6자리는 반려와 같은 처리에서 무효가 되고, 그 6자리로 늦게 온 상자는
  // 주문에 입고되지 않고 보류 → 7일 뒤 착불 반송이다. 옛 시험(「늦게 온 상자도 주문에 입고 시각이 남는다」)은 이 규칙과 반대라 바꿨다.
  it("INV-C3 · INV-C6: 반려된 주문에 늦게 들어온 상자는 주문에 입고되지 않고 보류(무효 6자리), 주문 입고 시각도 비어 있다", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] });
    psql(`update public.orders set status = 'expired' where id = '${g.orderId}'`);
    const staff = await signedInClient("fankkuk_staff");
    const r = await scanInbound(staff, waybill(), { code, ...HOLD_DETAILS, shelf: "T-R6" });
    expect(r.data).toMatchObject({ result: "hold", reason: "void_code" });
    expect(psql(`select (received_at is not null) || '/' || status from public.orders where id = '${g.orderId}'`)).toBe("false/expired");
  });
});

describe("자동 처리 (INV-W6)", () => {
  it("INV-W6: 「지금 돌리기」 한 줄은 다른 주문의 나갈 수 없는 상자를 건드리지 않는다", async () => {
    const a = await labeledGift();
    const b = await labeledGift();
    await inspect(a.staff, a.qrs[0], FAN_PASS);
    await inspect(b.staff, b.qrs[0], FAN_PASS);
    psql(`update public.orders set status = 'rejected' where id in ('${a.g.orderId}', '${b.g.orderId}')`);
    await a.staff.rpc("office_run_expiry", { p_order_no: a.g.orderNo });
    expect(parcelState(a.qrs[0])).toBe("return_waiting");
    expect(parcelState(b.qrs[0])).toBe("inspected");
  });

  it("INV-W6: 거절된 주문의 검수 완료 상자는 「승인 기다림」이 아니라 자동 처리 대기로 보인다", async () => {
    const { g, staff, qrs } = await labeledGift();
    await inspect(staff, qrs[0], FAN_PASS);
    psql(`update public.orders set status = 'rejected' where id = '${g.orderId}'`);
    const row = ((await staff.rpc("office_parcel_by_qr", { p_qr: qrs[0] })).data as { next_step: string }[])[0];
    expect(row.next_step).toBe("wait_expiry");
  });

  it("INV-W6: 앱 서버(서비스 키)도 정해진 때 자동 처리를 돌린다", async () => {
    const g = await paidGift();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    const r = await adminClient().rpc("office_run_expiry");
    expect(r.error).toBeNull();
    expect((r.data as { gifts: number }).gifts).toBeGreaterThanOrEqual(1);
    expect(orderStatus(g.orderId)).toBe("expired");
  });
});
