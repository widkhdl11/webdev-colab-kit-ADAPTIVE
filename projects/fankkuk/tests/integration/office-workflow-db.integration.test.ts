import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, approveRpc, deleteTestOrders, holdRowLock, psql, signedInClient } from "./helpers";
import {
  approve,
  creatorSetsWaybill,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  HOLD_DETAILS,
  inspect,
  orderStatus,
  paidGift,
  paidShare,
  parcelState,
  receiveAndLabel,
  scanInbound,
  sentWithAddress,
  SHARE_PASS,
  waybill,
} from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 사무실 작업 흐름 (office-workflow INV-W1~W8). 상자는 「스캔 → 서버가 허용해야 다음 단계」로만 움직인다.

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

function pendingLabels(operatorLogin: string): string {
  return psql(
    `select count(*) from public.office_label_pending l join public.profiles p on p.id = l.operator_id where p.login_id = '${operatorLogin}'`,
  );
}

describe("상태 전환표 (INV-W1)", () => {
  it("INV-W1 (S1): 결제 완료 상자의 원 송장을 입고 스캔하면 입고 완료, 내부 라벨 1장", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const r = await scanInbound(staff, no);
    expect(r.error).toBeNull();
    const out = r.data as { result: string; qr: string; order_no: string };
    expect(out.result).toBe("received");
    expect(out.qr).toMatch(/^Q-[0-9]{6}$/);
    expect(parcelState(out.qr)).toBe("received");
    expect(pendingLabels("fankkuk_staff")).toBe("1");
    expect(orderStatus(g.orderId)).toBe("received");
  });

  it("INV-W1: 한 단계씩 끝까지 — 부착 확인 → 검수 → 송장 출력 → 출고 확정, 주문 상태도 따라간다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect(parcelState(qr)).toBe("labeled");
    expect(pendingLabels("fankkuk_staff")).toBe("0");
    expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
    expect(orderStatus(g.orderId)).toBe("inspected");
    await approve(g);
    const owner = await signedInClient("fankkuk_admin");
    const out = waybill();
    expect((await owner.rpc("office_print_label", { p_qr: qr, p_waybill: out })).error).toBeNull();
    expect(parcelState(qr)).toBe("label_printed");
    expect((await staff.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out })).error).toBeNull();
    expect(parcelState(qr)).toBe("shipped");
    expect(orderStatus(g.orderId)).toBe("shipped");
  });

  it("INV-W1: 상자가 둘이면 주문 상태는 덜 간 상자를 따른다", async () => {
    const g = await paidGift(2);
    const [a, b] = [waybill(), waybill()];
    await fanSetsWaybill(g.boxIds[0], a);
    await fanSetsWaybill(g.boxIds[1], b);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, a);
    await inspect(staff, qr, FAN_PASS);
    expect(orderStatus(g.orderId)).toBe("registered"); // 둘째 상자는 아직 안 왔다
    await receiveAndLabel(staff, b);
    expect(orderStatus(g.orderId)).toBe("labeled");
  });

  it("INV-W1 (S1b, 실패경로): 입고 완료 상자를 출고 화면에서 스캔 → 거부, 상태 그대로", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = ((await scanInbound(staff, no)).data as { qr: string }).qr;
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("55000");
    expect((await staff.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: no })).error?.code).toBe("55000");
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).error?.code).toBe("55000");
    expect(parcelState(qr)).toBe("received");
  });

  it("INV-W1 (실패경로): 라벨 부착 확인은 직전에 출력한 라벨이어야 한다", async () => {
    const g = await paidGift(2);
    const [a, b] = [waybill(), waybill()];
    await fanSetsWaybill(g.boxIds[0], a);
    await fanSetsWaybill(g.boxIds[1], b);
    const staff = await signedInClient("fankkuk_staff");
    const owner = await signedInClient("fankkuk_admin");
    const qrA = ((await scanInbound(staff, a)).data as { qr: string }).qr;
    const qrB = ((await scanInbound(owner, b)).data as { qr: string }).qr;
    expect((await staff.rpc("office_confirm_label", { p_qr: qrB })).error?.code).toBe("P0043");
    expect(parcelState(qrB)).toBe("received");
    expect((await staff.rpc("office_confirm_label", { p_qr: qrA })).error).toBeNull();
  });

  it("INV-W1 (실패경로): 라벨 대기 줄이 남아 있어도 입고 완료가 아닌 상자는 부착 확인 거부(부착 확인 뒤·입고 전)", async () => {
    // 대기 줄은 입고 완료 상자에만 생기므로, 상태 검사만 따로 보려고 줄을 직접 심는다
    const g = await paidGift(2);
    const [a, b] = [waybill(), waybill()];
    await fanSetsWaybill(g.boxIds[0], a);
    await fanSetsWaybill(g.boxIds[1], b);
    const staff = await signedInClient("fankkuk_staff");
    const labeledQr = await receiveAndLabel(staff, a);
    const awaitingQr = psql(`select qr_code from public.office_parcels where tracking_no = '${b}'`);
    for (const [qr, state] of [
      [labeledQr, "labeled"],
      [awaitingQr, "awaiting"],
    ] as const) {
      const before = psql(`select state || '|' || coalesce(labeled_at::text, '') from public.office_parcels where qr_code = '${qr}'`);
      psql(
        `insert into public.office_label_pending (operator_id, parcel_id) select pr.id, p.id from public.profiles pr, public.office_parcels p where pr.login_id = 'fankkuk_staff' and p.qr_code = '${qr}'`,
      );
      try {
        expect((await staff.rpc("office_confirm_label", { p_qr: qr })).error?.code).toBe("55000");
        expect(pendingLabels("fankkuk_staff")).toBe("1");
        expect(parcelState(qr)).toBe(state);
        expect(psql(`select state || '|' || coalesce(labeled_at::text, '') from public.office_parcels where qr_code = '${qr}'`)).toBe(before);
      } finally {
        psql(`delete from public.office_label_pending where parcel_id in (select id from public.office_parcels where qr_code = '${qr}')`);
      }
    }
  });

  it("INV-W1 (실패경로): 출고 확정 스캔의 송장번호가 이 상자의 것이 아니면 거부", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, FAN_PASS);
    await approve(g);
    const owner = await signedInClient("fankkuk_admin");
    await owner.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() });
    expect((await staff.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("P0043");
    expect(parcelState(qr)).toBe("label_printed");
  });

  it("INV-W1 (S1c, 실패경로): 상태 칸을 직접 바꿀 길이 없다 — 로그인한 운영자도 표를 못 고친다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const owner = await signedInClient("fankkuk_admin");
    await owner.from("office_parcels").update({ state: "shipped" }).eq("tracking_no", no);
    expect(psql(`select state from public.office_parcels where tracking_no = '${no}'`)).toBe("awaiting");
  });

  it("INV-W1 (실패경로): 팬·크리에이터·손님은 작업 함수를 부를 수 없다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    for (const who of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(who);
      expect((await scanInbound(c, no)).error?.code).toBe("42501");
    }
    expect((await scanInbound(anonClient(), no)).error).not.toBeNull();
    expect(psql(`select state from public.office_parcels where tracking_no = '${no}'`)).toBe("awaiting");
  });

  it("INV-W1 (실패경로): 스캔 값 꼴이 다르면 거부(송장 10~14자리 숫자, QR Q-000000)", async () => {
    const staff = await signedInClient("fankkuk_staff");
    expect((await scanInbound(staff, "12-34")).error?.code).toBe("22023");
    expect((await staff.rpc("office_confirm_label", { p_qr: "FC-1234" })).error?.code).toBe("22023");
  });
});

describe("한 번만·한 상자씩 (INV-W2)", () => {
  it("INV-W2 (S2, 동시): 출고 확정 스캔 둘이 동시에 와도 하나만 반영된다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, FAN_PASS);
    await approve(g);
    const owner = await signedInClient("fankkuk_admin");
    const out = waybill();
    await owner.rpc("office_print_label", { p_qr: qr, p_waybill: out });
    // 다른 연결이 줄을 잠근 동안 둘을 보내 확실히 겹치게 한다 — 앞뒤로 오면 잠금 없이도 통과한다
    const { released } = await holdRowLock(`select 1 from public.office_parcels where qr_code = '${qr}' for update`, 3);
    const sentAt = Date.now();
    const rs = await Promise.all([
      staff.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out }),
      owner.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out }),
    ]);
    await released;
    // 잠금 뒤에 줄 서 있었다는 증거 — 잠금이 풀린 뒤에 도착했다면 겹치지 않은 것이라 이 시험은 아무것도 못 본다
    expect(Date.now() - sentAt).toBeGreaterThanOrEqual(1000);
    expect(rs.filter((r) => r.error === null)).toHaveLength(1);
    expect(rs.find((r) => r.error)?.error?.code).toBe("55000");
    expect(psql(`select count(*) from public.office_envelope_shreds s join public.office_parcels p on p.id = s.parcel_id where p.qr_code = '${qr}'`)).toBe("1");
  });

  it("INV-W2 (동시): 같은 원 송장을 두 사람이 동시에 입고 스캔해도 라벨은 한 장", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const owner = await signedInClient("fankkuk_admin");
    // 다른 연결이 줄을 잠근 동안 둘을 보내 확실히 겹치게 한다 — 앞뒤로 오면 잠금 없이도 통과한다
    const { released } = await holdRowLock(`select 1 from public.office_parcels where tracking_no = '${no}' for update`, 3);
    const sentAt = Date.now();
    const rs = await Promise.all([
      scanInbound(staff, no),
      scanInbound(owner, no),
    ]);
    await released;
    // 잠금 뒤에 줄 서 있었다는 증거 — 잠금이 풀린 뒤에 도착했다면 겹치지 않은 것이라 이 시험은 아무것도 못 본다
    expect(Date.now() - sentAt).toBeGreaterThanOrEqual(1000);
    const ok = rs.filter((r) => r.error === null);
    expect(ok).toHaveLength(1);
    expect((ok[0]!.data as { result: string }).result).toBe("received");
    // 늦은 쪽은 줄을 잠그고 기다렸다가 「이미 처리됨」을 받는다 — 라벨 표 제약에 걸린 알 수 없는 오류가 아니다
    expect(rs.find((r) => r.error)?.error?.code).toBe("55000");
    expect(psql(`select state from public.office_parcels where tracking_no = '${no}'`)).toBe("received");
    expect(
      psql(`select count(*) from public.office_label_pending l join public.office_parcels p on p.id = l.parcel_id where p.tracking_no = '${no}'`),
    ).toBe("1");
  });

  it("INV-W2 (S2b, 실패경로): 부착 확인 전에는 같은 작업자의 다음 상자 입고를 거부", async () => {
    const g = await paidGift(2);
    const [a, b] = [waybill(), waybill()];
    await fanSetsWaybill(g.boxIds[0], a);
    await fanSetsWaybill(g.boxIds[1], b);
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, a);
    expect((await scanInbound(staff, b)).error?.code).toBe("P0042");
    expect(psql(`select state from public.office_parcels where tracking_no = '${b}'`)).toBe("awaiting");
    // 다른 작업자는 받을 수 있다
    const owner = await signedInClient("fankkuk_admin");
    expect((await scanInbound(owner, b)).error).toBeNull();
  });

  it("INV-W2 (실패경로): 이미 입고된 원 송장을 다시 스캔하면 「이미 처리됨」", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    await receiveAndLabel(staff, no);
    expect((await scanInbound(staff, no)).error?.code).toBe("55000");
  });
});

describe("출고 조건 (INV-W3)", () => {
  async function inspectedGift() {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
    return { g, qr };
  }

  it("INV-W3 (S3, 실패경로): 승인 없는 검수 완료 팬 선물은 송장 출력 거부, 출고 목록에 없음", async () => {
    const { qr } = await inspectedGift();
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("P0041");
    expect(parcelState(qr)).toBe("inspected");
    const rows = (await owner.rpc("admin_office_parcels")).data as { qr: string | null; next_step: string }[];
    expect(rows.find((r) => r.qr === qr)?.next_step).toBe("wait_approval");
  });

  it("INV-W3 (S3c): 승인 전에 도착해도 입고·검수는 정상, 승인되면 출고 대기", async () => {
    const { g, qr } = await inspectedGift();
    await approve(g);
    const owner = await signedInClient("fankkuk_admin");
    const rows = (await owner.rpc("admin_office_parcels")).data as { qr: string | null; next_step: string }[];
    expect(rows.find((r) => r.qr === qr)?.next_step).toBe("print_label");
  });

  it("INV-W3 (실패경로): 송장 출력은 대표만 — 직원은 승인된 상자도 거부", async () => {
    const { g, qr } = await inspectedGift();
    await approve(g);
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("42501");
    expect(parcelState(qr)).toBe("inspected");
  });

  it("INV-W3 (실패경로): 차액 미납이면 승인돼 있어도 송장 출력 거부(payment INV-M12)", async () => {
    const { g, qr } = await inspectedGift();
    await approve(g);
    psql(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status) values ('${g.orderId}', 'difference', '${g.boxIds[0]}', 'pay_test_diff_${g.orderNo.slice(4).toLowerCase()}', 2000, 0, 500, 0, 1500, 'pending')`,
    );
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("P0041");
  });

  it("INV-W3 (실패경로): 거절된 주문의 상자는 검수 스캔에서 반송 대기로 가고 출고되지 않는다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    psql(`update public.orders set status = 'rejected' where id = '${g.orderId}'`);
    expect(await inspect(staff, qr, FAN_PASS)).toBe("return_waiting");
  });

  it("INV-W3 (S3b, 실패경로): 받기 전 역조공 상자는 송장 출력 거부, 받은 뒤에는 된다", async () => {
    const s = await paidShare();
    const no = waybill();
    await creatorSetsWaybill(s.shareId, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect(await inspect(staff, qr, SHARE_PASS)).toBe("inspected");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("P0041");
    psql(`update public.revgift_shares set reply = 'accepted', replied_at = now() where id = '${s.shareId}'`);
    expect((await owner.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error).toBeNull();
    expect(psql(`select received_at is not null and inspected_at is not null from public.revgift_shares where id = '${s.shareId}'`)).toBe("t");
  });
});

describe("검수 기록 (INV-W4)", () => {
  async function labeledGift() {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    return { g, staff, qr: await receiveAndLabel(staff, no) };
  }

  it("INV-W4 (S4, 실패경로): 검수 기록 없이 검수 스캔 → 거부", async () => {
    const { staff, qr } = await labeledGift();
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).error?.code).toBe("P0044");
    expect(parcelState(qr)).toBe("labeled");
  });

  it("INV-W4: 검수 기록에는 단계별 결과·시각·담당 운영자가 남는다", async () => {
    const { staff, qr } = await labeledGift();
    await inspect(staff, qr, FAN_PASS);
    const row = psql(
      `select i.bluetooth || '/' || i.rf || '/' || i.metal || '/' || i.outcome || '/' || p.login_id || '/' || (i.at is not null) from public.office_inspections i join public.office_parcels x on x.id = i.parcel_id join public.profiles p on p.id = i.inspected_by where x.qr_code = '${qr}'`,
    );
    expect(row).toBe("clear/clear/clear/pass/fankkuk_staff/true");
  });

  it("INV-W4 (S4b, 실패경로): 검수 기록은 고치거나 지울 수 없다", async () => {
    const { staff, qr } = await labeledGift();
    await inspect(staff, qr, FAN_PASS);
    const where = `parcel_id = (select id from public.office_parcels where qr_code = '${qr}')`;
    for (const sql of [`update public.office_inspections set outcome = 'return' where ${where}`, `delete from public.office_inspections where ${where}`]) {
      let err = "";
      try {
        psql(sql);
      } catch (e) {
        err = String((e as { stderr?: string }).stderr ?? e);
      }
      expect(err).toMatch(/고치거나 지울 수 없다/);
    }
  });

  it("INV-W4 (S4d, 실패경로): 팬 선물은 실측을 기록하지 않으면 검수 완료가 거부되고, 기록하면 완료된다", async () => {
    const { staff, qr } = await labeledGift();
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: FAN_PASS })).error).toBeNull();
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).error?.code).toBe("P0053");
    expect(parcelState(qr)).toBe("labeled");
    expect((await staff.rpc("office_record_measurement", { p_qr: qr, p_tier: "small" })).error).toBeNull();
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).data).toBe("inspected");
  });

  it("INV-W4 (S4e): 보관(추적 장치) 결과는 실측 없이도 넘어간다", async () => {
    const { staff, qr } = await labeledGift();
    const hold = { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" };
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: hold })).error).toBeNull();
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).data).toBe("held");
  });

  it("INV-W4·W6 (S4f): 보관된 상자는 보관 + 168시간에 자동 처리가 반송 대기로 — 167시간이면 그대로, 환불은 상품 대금 칸만", async () => {
    const { g, staff, qr } = await labeledGift();
    expect(await inspect(staff, qr, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" })).toBe("held");
    const backdate = (h: number) => psql(`update public.office_parcels set inspected_at = now() - interval '${h} hours' where qr_code = '${qr}'`);
    backdate(167);
    await staff.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(parcelState(qr)).toBe("held");
    backdate(168);
    const r = await staff.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect((r.data as { held: number }).held).toBe(1);
    expect(parcelState(qr)).toBe("return_waiting");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("returned");
    expect(psql(`select public.refund_due_of_payment(p.id) = p.goods_krw from public.payments p where p.order_id = '${g.orderId}' and p.kind = 'initial'`)).toBe("t");
    // 두 번 돌려도 같은 상자를 다시 처리하지 않는다(INV-W6)
    expect(((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).data as { held: number }).held).toBe(0);
  });

  it("INV-W4 (S4c): 추적 장치가 나온 팬 선물은 반송 대기가 아니라 보관, 크리에이터 알림 1건", async () => {
    const { staff, qr } = await labeledGift();
    expect(await inspect(staff, qr, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" })).toBe("held");
    expect(psql(`select count(*) from public.office_hold_alerts a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${qr}'`)).toBe("1");
  });

  it.each([
    ["추적 장치가 나왔는데 통과", { bluetooth: "clear", rf: "found", metal: "clear", outcome: "pass" }],
    ["추적 장치가 나왔는데 반송", { bluetooth: "found", rf: "clear", metal: "clear", outcome: "return" }],
    ["아무것도 없는데 보관", { ...FAN_PASS, outcome: "hold" }],
    ["팬 선물에 단계 결과 빠짐", { bluetooth: "clear", outcome: "pass" }],
    ["모르는 값", { bluetooth: "maybe", rf: "clear", metal: "clear", outcome: "pass" }],
  ])("INV-W4 (실패경로): %s → 기록 거부", async (_label, result) => {
    const { staff, qr } = await labeledGift();
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: result })).error?.code).toBe("22023");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qr}'`)).toBe("0");
  });

  it("INV-W4: 역조공은 겉면·금지 물품만 본다 — 금지 물품이 나오면 반송 대기", async () => {
    const s = await paidShare();
    const no = waybill();
    await creatorSetsWaybill(s.shareId, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: FAN_PASS })).error?.code).toBe("22023");
    expect(await inspect(staff, qr, { surface: "clear", prohibited: "found", outcome: "return" })).toBe("return_waiting");
  });
});

describe("미확인 입고 (INV-W5)", () => {
  // inbound-address-code(2026-10-07): 6자리로 이어지지 않은 상자가 보류(미확인 입고)다. 입고 스캔이 그 자리에서 기록하고,
  // 팬은 「받는 주소 없이 보냈어요」에 송장번호·택배사·이름 앞 1글자를 넣어 찾는다(INV-C4 ②).
  const find = (c: SupabaseClient, boxId: string, no: string) =>
    c.rpc("find_held_parcel", { p_box_id: boxId, p_share_id: null, p_waybill: no, p_carrier: "cj", p_sender_initial: "별" });

  it("INV-W5 (S5): 6자리 없는 상자를 입고 스캔하면 보류로 기록되고, 기록은 발신인 앞 한 글자만", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const no = waybill();
    const r = await scanInbound(staff, no, { carrier: "cj", initial: "별", shelf: "T-A1" });
    expect((r.data as { result: string }).result).toBe("hold");
    expect(psql(`select sender_initial || '/' || shelf from public.office_unmatched where waybill_no = '${no}'`)).toBe("별/T-A1");
    expect((await scanInbound(staff, waybill(), { carrier: "cj", initial: "별빛", shelf: "T-A2" })).error?.code).toBe("22023");
  });

  it("INV-W5 (S5b): 별빛이 자기 결제 완료 상자로 그 송장번호·택배사·이름 앞 1글자를 넣으면 이어지고 입고 완료", async () => {
    const g = await paidGift();
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-B1" });
    const fan = await signedInClient("byeolbit_fan");
    expect((await find(fan, g.boxIds[0], no)).data).toBe("matched");
    expect(psql(`select state from public.office_parcels where box_id = '${g.boxIds[0]}'`)).toBe("received");
    expect(psql(`select matched_parcel_id is not null from public.office_unmatched where waybill_no = '${no}'`)).toBe("t");
    // 직원이 선반에서 꺼내 원 송장을 다시 스캔하면 라벨이 나온다
    const again = await scanInbound(staff, no);
    expect((again.data as { result: string }).result).toBe("reprinted");
    expect(pendingLabels("fankkuk_staff")).toBe("1");
  });

  it("INV-W5 (S5c, 실패경로): 달토끼가 별빛 상자의 송장번호로 찾으면 이어지지 않는다", async () => {
    const g = await paidGift();
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-C1" });
    const dal = await signedInClient("daltokki_fan");
    expect((await find(dal, g.boxIds[0], no)).data).toBe("not_found");
    expect(psql(`select matched_parcel_id is null from public.office_unmatched where waybill_no = '${no}'`)).toBe("t");
  });

  it("INV-W5 (실패경로): 운영자가 손으로 잇는 길은 없다 — 운영자가 부르면 자기 상자가 아니라 거부, 표 직접 고치기도 거부", async () => {
    const g = await paidGift();
    const no = waybill();
    const owner = await signedInClient("fankkuk_admin");
    await scanInbound(owner, no, { ...HOLD_DETAILS, shelf: "T-D1" });
    expect((await find(owner, g.boxIds[0], no)).data).toBe("not_found");
    await owner.from("office_unmatched").update({ matched_parcel_id: null }).eq("waybill_no", no);
    expect(psql(`select state from public.office_parcels where box_id = '${g.boxIds[0]}'`)).toBe("awaiting");
  });

  it("INV-W5 (실패경로): 없는 송장번호로 찾으면 못 찾고, 이미 이어진 보류 상자는 다시 못 잇는다", async () => {
    const g = await paidGift(2);
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-E1" });
    const fan = await signedInClient("byeolbit_fan");
    expect((await find(fan, g.boxIds[0], waybill())).data).toBe("not_found");
    expect((await find(fan, g.boxIds[0], no)).data).toBe("matched");
    expect((await find(fan, g.boxIds[1], no)).data).toBe("not_found");
  });
});

describe("7일 자동 처리 (INV-W6)", () => {
  function backdateGift(orderId: string, interval: string): void {
    psql(`update public.orders set registered_at = now() - interval '${interval}' where id = '${orderId}'`);
  }
  function requestStatus(requestId: string): string {
    return psql(`select status from public.approval_requests where request_id = '${requestId}'`);
  }

  it("INV-W6 (S6): 결제 완료 + 167시간 59분이면 자동 처리해도 변화 없음", async () => {
    const g = await paidGift();
    backdateGift(g.orderId, "167 hours 59 minutes");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_run_expiry")).error).toBeNull();
    expect(requestStatus(g.requestId)).toBe("waiting");
    expect(orderStatus(g.orderId)).toBe("registered");
  });

  it("INV-W6 (S6b): + 168시간이면 반려, 두 번 돌려도 반려는 한 번", async () => {
    const g = await paidGift();
    backdateGift(g.orderId, "168 hours");
    const staff = await signedInClient("fankkuk_staff");
    const first = (await staff.rpc("office_run_expiry")).data as { gifts: number };
    const second = (await staff.rpc("office_run_expiry")).data as { gifts: number };
    expect(requestStatus(g.requestId)).toBe("expired");
    expect(orderStatus(g.orderId)).toBe("expired");
    expect(first.gifts).toBeGreaterThanOrEqual(1);
    expect(second.gifts).toBe(0);
  });

  it("INV-W6: 기한이 지나 반려된 주문에 와 있던 상자는 반송 대기로 간다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, FAN_PASS);
    backdateGift(g.orderId, "169 hours");
    await staff.rpc("office_run_expiry");
    expect(parcelState(qr)).toBe("return_waiting");
  });

  it("INV-W6 (실패경로): 기한이 지난 뒤에는 자동 처리 전이라도 승인이 거부된다", async () => {
    const g = await paidGift();
    backdateGift(g.orderId, "168 hours 1 minute");
    const r = await approveRpc(g.requestId);
    expect(r.data).not.toBe("approved");
    expect(psql(`select approved_at is null from public.orders where id = '${g.orderId}'`)).toBe("t");
  });

  it("INV-W6 (S6c, 동시): 승인과 자동 반려가 동시에 와도 하나만 반영된다", async () => {
    for (let i = 0; i < 4; i++) {
      const g = await paidGift();
      backdateGift(g.orderId, "167 hours 59 minutes 59.9 seconds");
      const staff = await signedInClient("fankkuk_staff");
      await Promise.all([approveRpc(g.requestId), staff.rpc("office_run_expiry")]);
      const both = psql(`select (approved_at is not null) || '/' || status from public.orders where id = '${g.orderId}'`);
      const req = requestStatus(g.requestId);
      expect([
        ["true/registered", "approved"],
        ["false/expired", "expired"],
      ]).toContainEqual([both, req]);
    }
  });

  it("INV-W6: 매칭 안 된 미확인 입고는 도착 168시간 뒤 기한 지남, 그 뒤에는 팬이 찾아도 안 이어진다", async () => {
    const g = await paidGift();
    const no = waybill();
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, no, { ...HOLD_DETAILS, shelf: "T-F1" });
    psql(`update public.office_unmatched set arrived_at = now() - interval '168 hours' where waybill_no = '${no}'`);
    const fan = await signedInClient("byeolbit_fan");
    const found = await fan.rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: no, p_carrier: "cj", p_sender_initial: "별" });
    expect(found.data).toBe("not_found");
    const r = (await staff.rpc("office_run_expiry")).data as { unmatched: number };
    expect(r.unmatched).toBeGreaterThanOrEqual(1);
    expect(psql(`select expired_at is not null from public.office_unmatched where waybill_no = '${no}'`)).toBe("t");
  });

  it("INV-W6: 차액 요청 뒤 168시간 미납이면 그 상자는 반송 대기(payment INV-M13), 167시간이면 그대로", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, FAN_PASS);
    await approve(g);
    const toss = `pay_test_diff_${g.orderNo.slice(4).toLowerCase()}`;
    psql(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, created_at) values ('${g.orderId}', 'difference', '${g.boxIds[0]}', '${toss}', 2000, 0, 500, 0, 1500, 'pending', now() - interval '167 hours')`,
    );
    await staff.rpc("office_run_expiry");
    expect(parcelState(qr)).toBe("inspected");
    psql(`update public.payments set created_at = now() - interval '168 hours' where toss_order_id = '${toss}'`);
    await staff.rpc("office_run_expiry");
    expect(parcelState(qr)).toBe("return_waiting");
  });

  it("INV-W6: 받기 기한이 지난 역조공 몫의 상자는 반송 대기(reverse-gift INV-R10)", async () => {
    const s = await paidShare();
    const no = waybill();
    await creatorSetsWaybill(s.shareId, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, SHARE_PASS);
    psql(`update public.revgift_sends set settled_at = now() - interval '168 hours' where id = '${s.sendId}'`);
    const r = (await staff.rpc("office_run_expiry")).data as { revgifts: number };
    expect(r.revgifts).toBeGreaterThanOrEqual(1);
    expect(parcelState(qr)).toBe("return_waiting");
  });

  it("INV-W6 (실패경로): 팬·크리에이터는 자동 처리를 돌릴 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("office_run_expiry")).error?.code).toBe("42501");
  });
});

describe("원 송장 봉투와 반송 (INV-W8)", () => {
  async function returnWaiting() {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect(await inspect(staff, qr, { ...FAN_PASS, outcome: "return" })).toBe("return_waiting");
    return { g, staff, qr };
  }

  it("INV-W8 (S8): 반송 대기 상자의 QR 을 스캔하면 그 상자의 봉투 번호가 뜨고, 반송 확정 때 파쇄 기록 1건", async () => {
    const { staff, qr } = await returnWaiting();
    const back = waybill();
    const r = await staff.rpc("office_print_return_label", { p_qr: qr, p_waybill: back });
    expect(r.error).toBeNull();
    expect(r.data).toBe(qr);
    expect(parcelState(qr)).toBe("return_printed");
    expect((await staff.rpc("office_confirm_return", { p_qr: qr, p_waybill: back })).error).toBeNull();
    expect(parcelState(qr)).toBe("returned");
    expect(psql(`select count(*) from public.office_envelope_shreds s join public.office_parcels p on p.id = s.parcel_id where p.qr_code = '${qr}'`)).toBe("1");
  });

  it("INV-W8 (S8b, 실패경로): 반송 대기가 아닌(검수 완료) 상자는 반송 송장 출력 거부", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, FAN_PASS);
    expect((await staff.rpc("office_print_return_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("55000");
    expect(parcelState(qr)).toBe("inspected");
  });

  it("INV-W8 (실패경로): 반송 확정 스캔의 송장번호가 이 상자의 반송 송장이 아니면 거부", async () => {
    const { staff, qr } = await returnWaiting();
    await staff.rpc("office_print_return_label", { p_qr: qr, p_waybill: waybill() });
    expect((await staff.rpc("office_confirm_return", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("P0043");
    expect(parcelState(qr)).toBe("return_printed");
  });

  it("INV-W8 (S8c): 출고 확정 때도 봉투 파쇄 기록 1건, 파쇄 기록은 고치거나 지울 수 없다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, FAN_PASS);
    await approve(g);
    const owner = await signedInClient("fankkuk_admin");
    const out = waybill();
    await owner.rpc("office_print_label", { p_qr: qr, p_waybill: out });
    await staff.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out });
    const where = `parcel_id = (select id from public.office_parcels where qr_code = '${qr}')`;
    expect(psql(`select count(*) || '/' || max(p.login_id) from public.office_envelope_shreds s join public.profiles p on p.id = s.shredded_by where ${where}`)).toBe("1/fankkuk_staff");
    let err = "";
    try {
      psql(`delete from public.office_envelope_shreds where ${where}`);
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(err).toMatch(/고치거나 지울 수 없다/);
  });
});

describe("상자 송장번호 입력", () => {
  it("INV-W5: 팬은 자기 결제 완료 상자에만 송장번호를 넣는다 — 남의 상자·결제 전·입고 뒤는 거부", async () => {
    const g = await paidGift();
    const dal = await signedInClient("daltokki_fan");
    // 남의 상자·입고 뒤는 오류가 아니라 값으로 거부한다 — 시도 기록(하루 10번)이 되돌려지지 않게(inbound-address-code 리뷰 반영)
    expect((await dal.rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: waybill() })).data).toBe("not_found");
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: "123" })).error?.code).toBe("22023");
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    // 입고 전에는 고칠 수 있다
    const fixed = waybill();
    expect((await fan.rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: fixed })).data).toBe("saved");
    const staff = await signedInClient("fankkuk_staff");
    sentWithAddress(fixed, { boxId: g.boxIds[0] });
    await receiveAndLabel(staff, fixed);
    expect((await fan.rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: waybill() })).data).toBe("already_received");
  });

  // inbound-address-code INV-C7(2026-10-07): 다른 상자가 이미 쓰는 송장번호도 거부하지 않는다 — 「이미 등록됨」 응답이
  // 남의 송장번호 등록 여부를 알려 주기 때문이다. 받되 두 상자를 같은 송장번호 분쟁으로 표시한다(옛 시험은 23505 거부를 봤다).
  it("INV-C7 (실패경로): 다른 상자가 이미 쓰는 송장번호도 같은 응답으로 받고, 두 상자를 분쟁으로 표시한다", async () => {
    const g = await paidGift(2);
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("set_box_waybill", { p_box_id: g.boxIds[1], p_waybill: no })).data).toBe("saved");
    expect(psql(`select count(*) from public.office_parcels where tracking_no = '${no}' and tracking_dispute`)).toBe("2");
  });

  it("INV-W5 (실패경로): 역조공 몫의 송장번호는 보낸 크리에이터만", async () => {
    const s = await paidShare();
    const momo = await signedInClient("momo_creator");
    expect((await momo.rpc("set_share_waybill", { p_share_id: s.shareId, p_waybill: waybill() })).data).toBe("not_found");
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("set_share_waybill", { p_share_id: s.shareId, p_waybill: waybill() })).data).toBe("not_found");
  });
});

describe("개인정보 없음 (INV-W7)", () => {
  it("INV-W7 (S7): 작업 목록·미확인 입고 목록의 칸에 실명·주소·전화가 없다", async () => {
    const g = await paidGift();
    await fanSetsWaybill(g.boxIds[0], waybill());
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, waybill(), { ...HOLD_DETAILS, shelf: "T-G1" });
    for (const fn of ["admin_office_parcels", "admin_unmatched_parcels"]) {
      const rows = (await staff.rpc(fn)).data as Record<string, unknown>[];
      expect(rows.length).toBeGreaterThan(0);
      for (const k of Object.keys(rows[0])) expect(k).not.toMatch(/^(name|real_?name|full_?name)$|phone|address|email|zip/);
      for (const r of rows) for (const v of Object.values(r)) expect(String(v)).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    }
  });

  it("INV-W7: 미확인 입고 표에는 발신인 앞 한 글자 말고 사람 칸이 없다", async () => {
    const cols = psql(
      "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'office_unmatched'",
    );
    // 택배사·보류 사유·붙어 온 6자리 줄·도용 의심 표시는 inbound-address-code(INV-C5·C9)가 더한 대조용 칸이다 — 사람 칸이 아니다.
    // returned_by 는 「반송으로 넘기기」를 누른 운영자(recorded_by 와 같은 작업자 칸)다.
    expect(cols.split(",")).toEqual([
      "arrived_at", "carrier", "code_id", "expired_at", "id", "matched_at", "matched_parcel_id", "reason", "recorded_by", "returned_by", "sender_initial", "shelf", "suspected_theft", "waybill_no",
    ]);
  });

  it("INV-W7 (실패경로): 팬·크리에이터는 작업 목록·미확인 목록을 읽지 못한다(빈 결과)", async () => {
    const staff = await signedInClient("fankkuk_staff");
    await scanInbound(staff, waybill(), { ...HOLD_DETAILS, shelf: "T-H1" });
    for (const who of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(who);
      expect((await c.rpc("admin_unmatched_parcels")).data).toEqual([]);
      expect((await c.rpc("admin_office_parcels")).data).toEqual([]);
    }
  });
});
