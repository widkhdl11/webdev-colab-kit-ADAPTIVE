import { afterEach, describe, expect, it } from "vitest";
import { adminClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import {
  approve,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  inspect,
  orderStatus,
  paidGift,
  parcelState,
  receiveAndLabel,
  waybill,
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
    expect((await staff.rpc("office_scan_inspect", { p_qr: qrs[0] })).data).toBe("inspected");
  });

  it("INV-W4 (실패경로): 라벨 부착 확인 전(입고 완료) 상자에는 검수 기록을 쓸 수 없다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = ((await staff.rpc("office_scan_inbound", { p_waybill: no })).data as { qr: string }).qr;
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
  it("INV-W5 (실패경로): 주인이 있는 송장번호는 미확인으로 기록할 수 없다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("office_record_unmatched", { p_waybill: no, p_sender_initial: "별", p_shelf: "T-R1" })).error?.code).toBe("55000");
    expect(psql(`select count(*) from public.office_unmatched where waybill_no = '${no}'`)).toBe("0");
  });

  it("INV-W5: 이미 기록한 미확인을 다시 스캔하면 「기록됨」, 두 번 기록하면 거부", async () => {
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("office_record_unmatched", { p_waybill: no, p_sender_initial: "별", p_shelf: "T-R2" });
    expect(((await staff.rpc("office_scan_inbound", { p_waybill: no })).data as { result: string }).result).toBe("unmatched_recorded");
    expect((await staff.rpc("office_record_unmatched", { p_waybill: no, p_sender_initial: "별", p_shelf: "T-R3" })).error?.code).toBe("55000");
  });

  it("INV-W5 (실패경로): 내 물건 찾기는 하루 실패 10번까지 — 11번째는 맞는 번호여도 거부", async () => {
    const g = await paidGift();
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("office_record_unmatched", { p_waybill: no, p_sender_initial: "별", p_shelf: "T-R4" });
    const fan = await signedInClient("byeolbit_fan");
    for (let i = 0; i < 10; i++) {
      expect((await fan.rpc("match_unmatched", { p_box_id: g.boxIds[0], p_waybill: waybill() })).data).toBe("not_found");
    }
    expect((await fan.rpc("match_unmatched", { p_box_id: g.boxIds[0], p_waybill: no })).error?.code).toBe("P0045");
    expect(psql(`select matched_parcel_id is null from public.office_unmatched where waybill_no = '${no}'`)).toBe("t");
  });

  it("INV-W5: 실패가 9번이면 10번째는 찾을 수 있다", async () => {
    const g = await paidGift();
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("office_record_unmatched", { p_waybill: no, p_sender_initial: "별", p_shelf: "T-R5" });
    const fan = await signedInClient("byeolbit_fan");
    for (let i = 0; i < 9; i++) await fan.rpc("match_unmatched", { p_box_id: g.boxIds[0], p_waybill: waybill() });
    expect((await fan.rpc("match_unmatched", { p_box_id: g.boxIds[0], p_waybill: no })).data).toBe("matched");
  });
});

describe("주문 상태 맞추기 (INV-W1)", () => {
  it("INV-W1: 보관된 상자가 있어도 나머지 상자가 출고되면 주문은 출고", async () => {
    const { g, staff, qrs } = await labeledGift(2);
    expect(await inspect(staff, qrs[0], { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" })).toBe("held");
    expect(await inspect(staff, qrs[1], FAN_PASS)).toBe("inspected");
    await approve(g);
    const owner = await signedInClient("fankkuk_admin");
    const out = waybill();
    await owner.rpc("office_print_label", { p_qr: qrs[1], p_waybill: out });
    await staff.rpc("office_confirm_shipment", { p_qr: qrs[1], p_waybill: out });
    expect(orderStatus(g.orderId)).toBe("shipped");
  });

  it("INV-W1: 상자 줄 없이 이미 앞 단계에 있던 주문은 상자 하나를 스캔해도 뒤로 가지 않는다", async () => {
    const g = await paidGift(2);
    psql(`update public.orders set status = 'inspected', received_at = now(), inspected_at = now(), inspection_result = 'passed' where id = '${g.orderId}'`);
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("office_scan_inbound", { p_waybill: no });
    expect(orderStatus(g.orderId)).toBe("inspected");
  });

  it("INV-W1: 반려된 주문에 늦게 들어온 상자도 주문에 입고 시각이 남는다(환불 계산이 입고를 안다)", async () => {
    const g = await paidGift();
    psql(`update public.orders set status = 'expired' where id = '${g.orderId}'`);
    const no = waybill();
    psql(`insert into public.office_parcels (box_id, inbound_waybill_no) values ('${g.boxIds[0]}', '${no}')`);
    const staff = await signedInClient("fankkuk_staff");
    expect(((await staff.rpc("office_scan_inbound", { p_waybill: no })).data as { result: string }).result).toBe("received");
    expect(psql(`select (received_at is not null) || '/' || status from public.orders where id = '${g.orderId}'`)).toBe("true/expired");
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
