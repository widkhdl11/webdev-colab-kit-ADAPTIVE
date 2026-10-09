import { afterEach, describe, expect, it } from "vitest";
import { deleteTestOrders, psql, signedInClient } from "./helpers";
import {
  approve,
  creatorSetsWaybill,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  inspect,
  paidGift,
  paidShare,
  parcelState,
  receiveAndLabel,
  scanInbound,
  SHARE_PASS,
  waybill,
  finishPrint,
} from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 사무실 작업 흐름 — 작업 함수의 권한 갈래 보강과 화면이 쓰는 읽기 함수 (office-workflow INV-W1~W7).

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

async function labeledGift() {
  const g = await paidGift();
  const no = waybill();
  await fanSetsWaybill(g.boxIds[0], no);
  const staff = await signedInClient("fankkuk_staff");
  return { g, no, staff, qr: await receiveAndLabel(staff, no) };
}

describe("작업 함수는 운영자만 (INV-W1)", () => {
  it.each(["byeolbit_fan", "haru_creator"])("INV-W1 (실패경로): %s 는 어느 작업 함수도 부를 수 없다", async (who) => {
    const { qr } = await labeledGift();
    const c = await signedInClient(who);
    const calls: [string, Record<string, unknown>][] = [
      ["office_confirm_label", { p_qr: qr }],
      // 옛 미확인 기록 함수 자리 — 입고 스캔이 보류 기록을 겸한다(inbound-address-code INV-C5)
      ["office_scan_inbound", { p_barcode: waybill(), p_code: null, p_carrier: "cj", p_sender_initial: "별", p_shelf: "T-X1" }],
      ["office_record_inspection", { p_qr: qr, p_result: FAN_PASS }],
      ["office_scan_inspect", { p_qr: qr }],
      ["office_confirm_shipment", { p_qr: qr, p_waybill: waybill() }],
      ["office_print_return_label", { p_qr: qr, p_waybill: waybill() }],
      ["office_confirm_return", { p_qr: qr, p_waybill: waybill() }],
    ];
    for (const [fn, args] of calls) {
      expect({ fn, code: (await c.rpc(fn, args)).error?.code }).toEqual({ fn, code: "42501" });
    }
    expect(parcelState(qr)).toBe("labeled");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qr}'`)).toBe("0");
    expect(psql("select count(*) from public.office_unmatched where shelf = 'T-X1'")).toBe("0");
  });
});

describe("한 번만 (INV-W2)", () => {
  it("INV-W2 (실패경로): 다른 작업자가 라벨을 출력한 상자를 또 입고 스캔하면 「이미 처리됨」", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const owner = await signedInClient("fankkuk_admin");
    await scanInbound(staff, no);
    expect((await scanInbound(owner, no)).error?.code).toBe("55000");
    expect(psql("select count(*) from public.office_label_pending")).toBe("1");
  });
});

describe("출고 조건의 갈래 (INV-W3)", () => {
  it("INV-W3 (실패경로): 승인 요청이 승인됐어도 주문에 승인 시각이 없으면 송장 출력 거부", async () => {
    const { g, staff, qr } = await labeledGift();
    await inspect(staff, qr, FAN_PASS);
    psql(
      `begin; set local fankkuk.approving = 'on'; update public.approval_requests set status = 'approved', decided_at = now() where request_id = '${g.requestId}'; commit;`,
    );
    expect(finishPrint(qr, waybill())).toBe("P0041");
  });

  it("INV-W3 (실패경로): 승인된 뒤 거절·반려로 바뀐 주문의 검수 완료 상자는 송장 출력 거부", async () => {
    const { g, staff, qr } = await labeledGift();
    await inspect(staff, qr, FAN_PASS);
    await approve(g);
    psql(`update public.orders set status = 'rejected' where id = '${g.orderId}'`);
    expect(finishPrint(qr, waybill())).toBe("P0041");
  });
});

describe("역조공 검수 결과 (INV-W4)", () => {
  it.each([
    ["금지 물품이 나왔는데 통과", { surface: "clear", prohibited: "found", outcome: "pass" }],
    ["겉면이 걸렸는데 통과", { surface: "found", prohibited: "clear", outcome: "pass" }],
    ["역조공을 보관", { surface: "clear", prohibited: "clear", outcome: "hold" }],
  ])("INV-W4 (실패경로): %s → 기록 거부", async (_label, result) => {
    const s = await paidShare();
    const no = waybill();
    await creatorSetsWaybill(s.shareId, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: result })).error?.code).toBe("22023");
  });
});

describe("작업 화면 읽기 (INV-W1·W7)", () => {
  it("INV-W2: 내 부착 대기 라벨 — 스캔하면 한 줄, 부착 확인하면 없다, 다른 작업자에게는 안 보인다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = ((await scanInbound(staff, no)).data as { qr: string }).qr;
    expect(((await staff.rpc("office_my_pending_label")).data as { qr: string }[]).map((r) => r.qr)).toEqual([qr]);
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_my_pending_label")).data).toEqual([]);
    await staff.rpc("office_confirm_label", { p_qr: qr });
    expect((await staff.rpc("office_my_pending_label")).data).toEqual([]);
  });

  it("INV-W1: QR 로 상자를 찾으면 지금 단계와 다음 할 일이 나온다", async () => {
    const { staff, qr } = await labeledGift();
    const r = await staff.rpc("office_parcel_by_qr", { p_qr: qr });
    expect(r.error).toBeNull();
    const row = (r.data as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ qr, kind: "gift", state: "labeled", next_step: "inspect", envelope_no: qr });
    for (const k of Object.keys(row)) expect(k).not.toMatch(/^(name|real_?name|full_?name)$|phone|address|email|zip/);
  });

  it("INV-W1 (실패경로): QR 찾기 — 꼴이 다르면 22023, 없으면 P0002, 운영자가 아니면 빈 결과", async () => {
    const { qr } = await labeledGift();
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("office_parcel_by_qr", { p_qr: "FC-1" })).error?.code).toBe("22023");
    expect((await staff.rpc("office_parcel_by_qr", { p_qr: "Q-999999" })).error?.code).toBe("P0002");
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("office_parcel_by_qr", { p_qr: qr })).data).toEqual([]);
  });
});

describe("자동 처리 현황 (INV-W6)", () => {
  it("INV-W6: 기한이 지났는데 아직 처리 안 된 팬 선물만 예정 목록에 나온다", async () => {
    const due = await paidGift();
    const notYet = await paidGift();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${due.orderId}'`);
    psql(`update public.orders set registered_at = now() - interval '100 hours' where id = '${notYet.orderId}'`);
    const staff = await signedInClient("fankkuk_staff");
    const rows = (await staff.rpc("admin_expiry_due")).data as { category: string; order_no: string; due_at: string }[];
    const nos = rows.filter((r) => r.category === "gift").map((r) => r.order_no);
    expect(nos).toContain(due.orderNo);
    expect(nos).not.toContain(notYet.orderNo);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("admin_expiry_due")).data).toEqual([]);
  });

  it("INV-W6: 「지금 돌리기」는 그 한 줄만 — 같은 때 기한이 지난 다른 주문은 그대로", async () => {
    const a = await paidGift();
    const b = await paidGift();
    for (const g of [a, b]) psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    const staff = await signedInClient("fankkuk_staff");
    const r = (await staff.rpc("office_run_expiry", { p_order_no: a.orderNo })).data as { gifts: number };
    expect(r.gifts).toBe(1);
    expect(psql(`select status from public.orders where id = '${a.orderId}'`)).toBe("expired");
    expect(psql(`select status from public.orders where id = '${b.orderId}'`)).toBe("registered");
  });

  it("INV-W6 (실패경로): 기한 전인 주문을 「지금 돌리기」 해도 반려되지 않는다", async () => {
    const g = await paidGift();
    psql(`update public.orders set registered_at = now() - interval '100 hours' where id = '${g.orderId}'`);
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("registered");
  });

  it("INV-W6: 역조공 처리 목록 — 몫마다 팬의 답과 받기 기한, 운영자만", async () => {
    const s = await paidShare();
    const staff = await signedInClient("fankkuk_staff");
    const row = ((await staff.rpc("admin_revgift_shares")).data as { order_no: string; reply: string; deadline_at: string }[]).find(
      (r) => r.order_no === s.orderNo,
    );
    expect(row?.reply).toBe("waiting");
    expect(Number.isNaN(Date.parse(row?.deadline_at ?? ""))).toBe(false);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("admin_revgift_shares")).data).toEqual([]);
  });
});

describe("내 상자 읽기 (INV-W5·W7)", () => {
  it("INV-W5: 팬은 자기 주문의 상자마다 송장번호·단계를 본다 — 출고 송장번호는 없다", async () => {
    const g = await paidGift(2);
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const fan = await signedInClient("byeolbit_fan");
    const rows = (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data as Record<string, unknown>[];
    // 결제 때 상자마다 작업 줄('입고 전')이 생긴다(inbound-address-code INV-C1) — 송장번호를 안 넣은 상자도 awaiting
    expect(rows.map((r) => [r.label, r.waybill_no, r.state])).toEqual([
      [`${g.orderNo}-1`, no, "awaiting"],
      [`${g.orderNo}-2`, null, "awaiting"],
    ]);
    for (const k of Object.keys(rows[0])) expect(k).not.toMatch(/outbound|return_waybill/);
  });

  it("INV-W5 (실패경로): 남의 주문 상자는 빈 결과", async () => {
    const g = await paidGift();
    const dal = await signedInClient("daltokki_fan");
    expect((await dal.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data).toEqual([]);
  });

  it("INV-W5: 크리에이터는 자기가 보낸 몫의 송장번호를 보고, 다른 크리에이터는 못 본다", async () => {
    const s = await paidShare();
    const no = waybill();
    await creatorSetsWaybill(s.shareId, no);
    const haru = await signedInClient("haru_creator");
    const mine = ((await haru.rpc("my_share_boxes")).data as { order_no: string; waybill_no: string | null; state: string }[]).find(
      (r) => r.order_no === s.orderNo,
    );
    expect(mine).toMatchObject({ waybill_no: no, state: "awaiting" });
    const momo = await signedInClient("momo_creator");
    expect(((await momo.rpc("my_share_boxes")).data as { order_no: string }[]).map((r) => r.order_no)).not.toContain(s.orderNo);
  });

  it("INV-W7: 검수 통과 뒤 단계가 팬에게도 같이 보인다(상자 줄과 같은 값)", async () => {
    const { g, staff, qr } = await labeledGift();
    expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
    const fan = await signedInClient("byeolbit_fan");
    const rows = (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data as { state: string }[];
    expect(rows[0].state).toBe("inspected");
    expect(SHARE_PASS.outcome).toBe("pass");
  });
});
