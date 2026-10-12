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
  finishPrint,
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
import { PHONE_IN_TEXT } from "./pii-shape";

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
    const out = waybill();
    expect(finishPrint(qr, out)).toBeNull();
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
    expect(finishPrint(qr, waybill())).toBe("55000");
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
    expect(finishPrint(qr, waybill())).toBeNull();
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
    expect(finishPrint(qr, out)).toBeNull();
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
    expect(finishPrint(qr, waybill())).toBe("P0041");
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

  // 송장 출력은 주소를 여는 함수(대표만, address-protection INV-P8)를 거쳐야만 출력 단계로 간다.
  // 로그인 키로 부를 수 있던 옛 출력 함수(주소를 열지 않고 열람 기록도 없이 「송장 출력함」으로 넘김)는 지웠다.
  it("INV-W3 (실패경로): 직원도 대표도 로그인 키로는 주소를 열지 않고 상자를 송장 출력 단계로 넘길 수 없다", async () => {
    const { g, qr } = await inspectedGift();
    await approve(g);
    for (const login of ["fankkuk_staff", "fankkuk_admin"]) {
      const client = await signedInClient(login);
      // 옛 출력 함수는 없다
      expect((await client.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code, login).toBe("PGRST202");
      // 출력 마무리 함수는 주소 열기 계정만 부른다
      expect((await client.rpc("invoice_finish_print", { p_qr: qr, p_waybill: waybill() })).error?.code, login).toBe("42501");
      expect((await client.rpc("revgift_finish_print", { p_qr: qr, p_waybill: waybill() })).error?.code, login).toBe("42501");
    }
    expect(parcelState(qr)).toBe("inspected");
    // 데이터 API 의 함수 목록이 낡아도 속지 않게 DB 에 직접 묻는다
    expect(psql("select count(*) from pg_proc where proname = 'office_print_label'")).toBe("0");
    for (const fn of ["invoice_finish_print", "revgift_finish_print"]) {
      expect(psql(`select has_function_privilege('authenticated', 'public.${fn}(text, text)', 'execute')`), fn).toBe("f");
      expect(psql(`select has_function_privilege('anon', 'public.${fn}(text, text)', 'execute')`), fn).toBe("f");
    }
    // 같은 상자가 출고 조건은 지키고 있다 — 막힌 것은 길이지 상자가 아니다
    expect(finishPrint(qr, waybill())).toBeNull();
    expect(parcelState(qr)).toBe("label_printed");
  });

  it("INV-W3 (실패경로): 차액 미납이면 승인돼 있어도 송장 출력 거부(payment INV-M12)", async () => {
    const { g, qr } = await inspectedGift();
    await approve(g);
    psql(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status) values ('${g.orderId}', 'difference', '${g.boxIds[0]}', 'pay_test_diff_${g.orderNo.slice(4).toLowerCase()}', 2000, 0, 500, 0, 1500, 'pending')`,
    );
    expect(finishPrint(qr, waybill())).toBe("P0041");
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
    expect(finishPrint(qr, waybill())).toBe("P0041");
    psql(`update public.revgift_shares set reply = 'accepted', replied_at = now() where id = '${s.shareId}'`);
    expect(finishPrint(qr, waybill())).toBeNull();
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

  const TRACKER = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" } as const;
  const verdictOf = (qr: string) =>
    psql(`select coalesce(i.tracker_verdict, '-') from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qr}'`);

  it("INV-W4 (S4e): 추적기 반송 결과는 실측 없이도 반송 대기로 넘어간다", async () => {
    const { staff, qr } = await labeledGift();
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: TRACKER })).error).toBeNull();
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).data).toBe("return_waiting");
  });

  it("INV-W4 (S4c): 추적기로 판정한 팬 선물은 보관 없이 바로 반송 대기, 추적기 기록 1줄, 주문의 검수 결과 「반송」, 판정 값이 기록에 남는다", async () => {
    const { g, staff, qr } = await labeledGift();
    expect(await inspect(staff, qr, TRACKER)).toBe("return_waiting");
    expect(parcelState(qr)).toBe("return_waiting");
    expect(psql(`select count(*) from public.office_hold_alerts a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${qr}'`)).toBe("1");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("returned");
    expect(verdictOf(qr)).toBe("tracker");
  });

  it("INV-W4 (S4f): 추적기 반송의 환불은 상품 대금 칸만이고, 자동 처리를 돌려도 바뀌는 것이 없다", async () => {
    const { g, staff, qr } = await labeledGift();
    expect(await inspect(staff, qr, TRACKER)).toBe("return_waiting");
    expect(psql(`select public.refund_due_of_payment(p.id) = p.goods_krw from public.payments p where p.order_id = '${g.orderId}' and p.kind = 'initial'`)).toBe("t");
    psql(`update public.office_parcels set inspected_at = now() - interval '169 hours' where qr_code = '${qr}'`);
    const r = await staff.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(r.error).toBeNull();
    expect((r.data as { held: number }).held).toBe(0);
    expect(parcelState(qr)).toBe("return_waiting");
  });

  it("INV-W4 (S4g): 블루투스 반응이지만 「추적기 아님」이면 크리에이터 확인 — 실측 뒤 검수 스캔으로 확인 대기(held), 판정 값이 기록에 남고 추적기 기록은 없다", async () => {
    const { staff, qr } = await labeledGift();
    const result = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" };
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: result })).error).toBeNull();
    // 받으면 그대로 출고되므로 실측 기록 규칙이 같다(S4d)
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).error?.code).toBe("P0053");
    expect((await staff.rpc("office_record_measurement", { p_qr: qr, p_tier: "small" })).error).toBeNull();
    expect((await staff.rpc("office_scan_inspect", { p_qr: qr })).data).toBe("held");
    expect(verdictOf(qr)).toBe("not_tracker");
    expect(psql(`select count(*) from public.office_hold_alerts a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${qr}'`)).toBe("0");
    expect(psql(`select count(*) from public.office_creator_checks k join public.office_parcels p on p.id = k.parcel_id where p.qr_code = '${qr}' and k.answer is null`)).toBe("1");
  });

  it("INV-W4 (S4g): RF 반응 · 「추적기 아님」 · 반송도 고를 수 있다 — 일반 반송 대기", async () => {
    const { staff, qr } = await labeledGift();
    expect(await inspect(staff, qr, { bluetooth: "clear", rf: "found", metal: "clear", tracker_verdict: "not_tracker", outcome: "return" })).toBe("return_waiting");
    expect(verdictOf(qr)).toBe("not_tracker");
  });

  it.each([
    ["반응이 있는데 판정 없이 추적기 반송", { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" }],
    ["반응이 있는데 판정 없이 통과", { bluetooth: "clear", rf: "found", metal: "clear", outcome: "pass" }],
    ["추적기인데 통과", { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "pass" }],
    ["추적기인데 일반 반송", { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "return" }],
    ["추적기 아닌데 추적기 반송", { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "hold" }],
    ["추적기 아닌데 바로 통과(D3 ②)", { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "pass" }],
    ["추적기인데 크리에이터 확인", { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "confirm" }],
    ["반응이 없는데 크리에이터 확인", { ...FAN_PASS, outcome: "confirm" }],
    ["반응이 없는데 판정", { ...FAN_PASS, tracker_verdict: "not_tracker" }],
    ["모르는 판정 값", { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "maybe", outcome: "pass" }],
    ["아무것도 없는데 추적기 반송", { ...FAN_PASS, outcome: "hold" }],
    ["팬 선물에 단계 결과 빠짐", { bluetooth: "clear", outcome: "pass" }],
    ["모르는 값", { bluetooth: "maybe", rf: "clear", metal: "clear", outcome: "pass" }],
  ])("INV-W4 (S4g, 실패경로): %s → 기록 거부", async (_label, result) => {
    const { staff, qr } = await labeledGift();
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: result })).error?.code).toBe("22023");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qr}'`)).toBe("0");
  });

  it.each([
    ["추적기 판정인데 결론이 통과", "'found', 'clear', 'clear', null, null, 'tracker', 'pass'", "office_inspections_tracker_verdict_outcome"],
    ["추적기 아님인데 결론이 추적기 반송", "'found', 'clear', 'clear', null, null, 'not_tracker', 'hold'", "office_inspections_tracker_verdict_outcome"],
    ["역조공 칸에 판정", "null, null, null, 'clear', 'clear', 'not_tracker', 'pass'", "office_inspections_tracker_verdict_gift"],
    ["판정 없이 크리에이터 확인", "'clear', 'clear', 'clear', null, null, null, 'confirm'", "office_inspections_confirm_verdict"],
  ])("INV-W4 (S4g, 실패경로): 표 검사도 막는다 — %s", async (_label, values, constraint) => {
    const { qr } = await labeledGift();
    let err = "";
    try {
      psql(
        `insert into public.office_inspections (parcel_id, inspected_by, bluetooth, rf, metal, surface, prohibited, tracker_verdict, outcome)
         select p.id, (select id from public.profiles where login_id = 'fankkuk_staff'), ${values} from public.office_parcels p where p.qr_code = '${qr}'`,
      );
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(err).toContain(constraint);
  });

  it("INV-W4 (S4g, 실패경로): 역조공 기록에 판정 칸을 붙이면 거부", async () => {
    const s = await paidShare();
    const no = waybill();
    await creatorSetsWaybill(s.shareId, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: { ...SHARE_PASS, tracker_verdict: "not_tracker" } })).error?.code).toBe("22023");
    expect((await staff.rpc("office_record_inspection", { p_qr: qr, p_result: { ...SHARE_PASS, outcome: "confirm" } })).error?.code).toBe("22023");
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

describe("크리에이터 확인 — 추적기 아님 블루투스·RF 상자 (INV-W4·W6, 2026-10-12 (2) 문제집 D3 ②)", () => {
  const CONFIRM = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" } as const;

  /** 상자 n개 주문 — 모두 입고·라벨 부착까지. 돌려주는 qrs 는 상자 순서대로 */
  async function labeledBoxes(n = 1) {
    const g = await paidGift(n);
    const staff = await signedInClient("fankkuk_staff");
    const qrs: string[] = [];
    for (const boxId of g.boxIds) {
      const no = waybill();
      await fanSetsWaybill(boxId, no);
      qrs.push(await receiveAndLabel(staff, no));
    }
    return { g, staff, qrs };
  }

  const answer = async (login: string, orderNo: string, seq: number, a: string) =>
    (await signedInClient(login)).rpc("answer_creator_check", { p_order_no: orderNo, p_box_seq: seq, p_answer: a });
  const checkAnswer = (qr: string) =>
    psql(`select coalesce(k.answer, '-') from public.office_creator_checks k join public.office_parcels p on p.id = k.parcel_id where p.qr_code = '${qr}'`);
  const refundDue = (orderId: string) =>
    psql(`select coalesce(public.refund_due_of_payment(p.id)::text, '-') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);
  const fanAlerts = (orderId: string, kind: string) =>
    psql(
      `select count(*) from public.notification_outbox n join public.profiles pr on pr.id = n.account_id where n.order_id = '${orderId}' and n.kind = '${kind}' and pr.login_id = 'byeolbit_fan' and n.channel = 'email'`,
    );

  it("INV-W4: 확인 대기 상자는 주문을 검수 단계에 멈춰 둔다 — 주문은 「라벨」, 검수 결과는 비어 있다", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    expect(await inspect(staff, qrs[0]!, CONFIRM)).toBe("held");
    expect(orderStatus(g.orderId)).toBe("labeled");
    expect(psql(`select coalesce(inspection_result, '-') from public.orders where id = '${g.orderId}'`)).toBe("-");
    expect(psql(`select public.office_next_step(p, 'gift') from public.office_parcels p where p.qr_code = '${qrs[0]}'`)).toBe("held");
  });

  it("INV-W4: 크리에이터가 「받기」 → 그 상자는 검수 완료, 주문은 검수 결과 「통과」로 진행하고 승인 뒤 출고할 수 있다", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    const r = await answer("haru_creator", g.orderNo, 1, "accept");
    expect(r.error).toBeNull();
    expect(r.data).toBe("accepted");
    expect(parcelState(qrs[0]!)).toBe("inspected");
    expect(checkAnswer(qrs[0]!)).toBe("accept");
    expect(orderStatus(g.orderId)).toBe("inspected");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("passed");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
    await approve(g);
    expect(finishPrint(qrs[0]!, waybill())).toBeNull();
  });

  it("INV-W4: 크리에이터가 「돌려보내기」 → 반송 대기, 금속 반송과 같은 돈 처리(상품 대금 칸만)와 팬 「돌려보낼 상자」 알림, 승인 전 주문은 더 승인할 수 없다", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    const r = await answer("haru_creator", g.orderNo, 1, "return");
    expect(r.error).toBeNull();
    expect(r.data).toBe("returned");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkAnswer(qrs[0]!)).toBe("return");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("returned");
    expect(psql(`select public.refund_due_of_payment(p.id) = p.goods_krw from public.payments p where p.order_id = '${g.orderId}' and p.kind = 'initial'`)).toBe("t");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("1");
    expect((await approveRpc(g.requestId)).data).toBe("not_approvable");
  });

  it("INV-W4 (실패경로): 돌려보낸 상자의 주문이 7일 반려로 끝나도 그 상자는 검수 불합격 줄 — 환불 0(금속 반송과 같다)", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    expect((await answer("haru_creator", g.orderNo, 1, "return")).data).toBe("returned");
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    expect((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).error).toBeNull();
    expect(orderStatus(g.orderId)).toBe("expired");
    expect(refundDue(g.orderId)).toBe("0");
  });

  it("INV-W6: 168시간 안에 답이 없으면 자동 처리가 반송 대기로 — 답은 「기한 지남」, 팬 알림·돈 처리는 돌려보내기와 같고 두 번 돌려도 한 번", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    psql(`update public.office_parcels set inspected_at = now() - interval '169 hours' where qr_code = '${qrs[0]}'`);
    const owner = await signedInClient("fankkuk_admin");
    const first = await owner.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(first.error).toBeNull();
    expect((first.data as { held: number }).held).toBe(1);
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkAnswer(qrs[0]!)).toBe("expired");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("returned");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("1");
    const again = await owner.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect((again.data as { held: number }).held).toBe(0);
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("1");
  });

  it("INV-W6 (실패경로): 168시간이 지나면 자동 처리 전이라도 답을 받지 않는다 — 상자는 그대로 확인 대기", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    psql(`update public.office_parcels set inspected_at = now() - interval '169 hours' where qr_code = '${qrs[0]}'`);
    expect((await answer("haru_creator", g.orderNo, 1, "accept")).data).toBe("expired");
    expect(parcelState(qrs[0]!)).toBe("held");
    expect(checkAnswer(qrs[0]!)).toBe("-");
  });

  it("INV-W4 (실패경로): 다른 크리에이터·보낸 팬은 답할 수 없고(없는 것과 같은 답), 두 번째 답은 「이미」, 모르는 답은 거부", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    expect((await answer("momo_creator", g.orderNo, 1, "accept")).data).toBe("not_found");
    expect((await answer("byeolbit_fan", g.orderNo, 1, "return")).data).toBe("not_found");
    expect((await answer("haru_creator", g.orderNo, 2, "accept")).data).toBe("not_found");
    expect((await answer("haru_creator", g.orderNo, 1, "maybe")).error?.code).toBe("22023");
    expect(parcelState(qrs[0]!)).toBe("held");
    expect((await answer("haru_creator", g.orderNo, 1, "accept")).data).toBe("accepted");
    expect((await answer("haru_creator", g.orderNo, 1, "return")).data).toBe("already");
    expect(parcelState(qrs[0]!)).toBe("inspected");
    const anon = await anonClient().rpc("answer_creator_check", { p_order_no: g.orderNo, p_box_seq: 1, p_answer: "accept" });
    expect(anon.error).not.toBeNull();
  });

  it("INV-W3·W4: 승인된 주문 — 다른 상자는 확인을 기다리지 않고 출고할 수 있고, 돌려보내면 금속 반송처럼 주문 검수 결과가 「반송」", async () => {
    const { g, staff, qrs } = await labeledBoxes(2);
    await approve(g);
    expect(await inspect(staff, qrs[0]!, FAN_PASS)).toBe("inspected");
    expect(await inspect(staff, qrs[1]!, CONFIRM)).toBe("held");
    expect(orderStatus(g.orderId)).toBe("labeled");
    expect(finishPrint(qrs[0]!, waybill())).toBeNull();
    // 확인 대기 상자는 출고 단계에서 거부된다
    expect(finishPrint(qrs[1]!, waybill())).not.toBeNull();
    expect((await answer("haru_creator", g.orderNo, 2, "return")).data).toBe("returned");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("returned");
  });

  it("INV-W4: 확인을 기다리는 동안 주문이 거절되면 질문은 닫히고 상자는 바로 반송 대기 — 검수 불합격이 아니라 거절 환불(배송비 칸만 뺀다)", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false })).error).toBeNull();
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkAnswer(qrs[0]!)).toBe("-");
    expect((await answer("haru_creator", g.orderNo, 1, "accept")).data).toBe("closed");
    expect(refundDue(g.orderId)).toBe(psql(`select (sum(b.price_krw - b.shipping_fee_krw))::text from public.boxes b where b.order_id = '${g.orderId}'`));
  });

  it("INV-W4 (실패경로): 나갈 수 없게 된 상자(차액 기한 지남)는 자동 처리가 옮기기 전이라도 답을 받지 않는다 — 「끝남」, 상자는 그대로", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    expect((await staff.rpc("office_record_measurement", { p_qr: qrs[0], p_tier: "medium" })).error).toBeNull();
    expect(await inspect(staff, qrs[0]!, CONFIRM)).toBe("held");
    psql(`update public.payments set expired_at = now() where order_id = '${g.orderId}' and kind = 'difference'`);
    expect((await answer("haru_creator", g.orderNo, 1, "accept")).data).toBe("closed");
    expect(parcelState(qrs[0]!)).toBe("held");
    expect(checkAnswer(qrs[0]!)).toBe("-");
  });

  it("INV-W6: 확인을 기다리는 동안 주문이 7일 반려되면 자동 처리가 상자를 반송 대기로 — 답은 비어 있고 팬 「돌려보낼 상자」 알림은 없다", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    // 확인 기한도 함께 지났다 — 끝난 주문의 상자는 「기한 지남」이 아니라 닫힌 질문이다
    psql(`update public.orders set registered_at = now() - interval '200 hours' where id = '${g.orderId}'`);
    psql(`update public.office_parcels set inspected_at = now() - interval '169 hours' where qr_code = '${qrs[0]}'`);
    expect((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).error).toBeNull();
    expect(orderStatus(g.orderId)).toBe("expired");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkAnswer(qrs[0]!)).toBe("-");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
  });

  it("INV-W4: 대표의 입고 뒤 취소도 확인 대기 상자를 바로 반송 대기로 넘긴다", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, CONFIRM);
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "시험" })).error).toBeNull();
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
  });

  it("INV-W4: 크리에이터 읽기 — 하루는 보낸 팬 닉네임·상자 순번·반응 종류·기한을 보고, 다른 크리에이터·팬에게는 줄이 없다", async () => {
    const { g, staff, qrs } = await labeledBoxes();
    await inspect(staff, qrs[0]!, { ...CONFIRM, bluetooth: "clear", rf: "found" });
    const mine = (await (await signedInClient("haru_creator")).rpc("my_creator_checks")).data as Record<string, unknown>[];
    const row = mine.find((r) => r.order_no === g.orderNo);
    expect(row).toMatchObject({ order_no: g.orderNo, box_seq: 1, sender_nickname: "별빛", bluetooth: false, rf: true });
    const due = psql(`select extract(epoch from inspected_at + interval '168 hours') from public.office_parcels where qr_code = '${qrs[0]}'`);
    expect(new Date(String(row!.due_at)).getTime() / 1000).toBeCloseTo(Number(due), 2);
    for (const login of ["momo_creator", "byeolbit_fan"]) {
      const other = (await (await signedInClient(login)).rpc("my_creator_checks")).data as Record<string, unknown>[] | null;
      expect([login, (other ?? []).some((r) => r.order_no === g.orderNo)]).toEqual([login, false]);
    }
    // 답한 뒤에는 목록에서 빠진다
    await answer("haru_creator", g.orderNo, 1, "accept");
    const after = (await (await signedInClient("haru_creator")).rpc("my_creator_checks")).data as Record<string, unknown>[];
    expect(after.some((r) => r.order_no === g.orderNo)).toBe(false);
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
    const out = waybill();
    expect(finishPrint(qr, out)).toBeNull();
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
      for (const r of rows) for (const v of Object.values(r)) expect(String(v)).not.toMatch(PHONE_IN_TEXT);
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
