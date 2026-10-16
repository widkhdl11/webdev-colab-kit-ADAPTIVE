import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { deleteTestOrders, holdRowLock, psql, signedInClient } from "./helpers";
import { approve, codeOf, deleteTestUnmatched, FAN_PASS, HOLD_DETAILS, inspect, paidGift, scanInbound, waybill, type Unit } from "./office-helpers";

// 승인 뒤 도착하지 않은 상자 (office-workflow INV-W10 S10~S10c · payment INV-M8·M9 S8d·S8e · notifications INV-N15 S15, 카드 d50).
// 결제 완료 + 14일(336시간)에 팬 알림 한 번, + 30일(720시간)에 안 온 상자를 닫는다(6자리 무효, 그 상자 금액이 환불 대상).
// 상자가 하나도 오지 않았으면 주문 취소(전액). 시간은 주문의 결제 완료 시각(registered_at)을 앞으로 옮겨 흉내 낸다.

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
});

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

/** 6자리로 입고 + 라벨 부착 확인. 돌려주는 값은 내부 QR. */
async function receive(op: SupabaseClient, boxId: string): Promise<string> {
  const r = await scanInbound(op, waybill(), { code: codeOf({ boxId }) });
  expect(r.data).toMatchObject({ result: "received" });
  const qr = (r.data as { qr: string }).qr;
  expect((await op.rpc("office_confirm_label", { p_qr: qr })).error).toBeNull();
  return qr;
}

/** 승인된 상자 n 개 주문 */
async function approvedGift(boxes: number): Promise<Unit> {
  const g = await paidGift(boxes);
  await approve(g);
  return g;
}

const backdate = (orderId: string, hours: number) =>
  psql(`update public.orders set registered_at = now() - interval '${hours} hours' where id = '${orderId}'`);

async function runExpiry(orderNo?: string): Promise<{ box_missing_alerts: number; boxes_missing: number }> {
  const r = await (await staff()).rpc("office_run_expiry", orderNo ? { p_order_no: orderNo } : {});
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.code} ${r.error.message}`);
  return r.data as { box_missing_alerts: number; boxes_missing: number };
}

const alerts = (orderId: string) =>
  psql(
    `select string_agg(p.login_id || '|' || o.channel, ',') from public.notification_outbox o join public.profiles p on p.id = o.account_id where o.order_id = '${orderId}' and o.kind = 'box_missing'`,
  );
const missing = (boxId: string) => psql(`select missing_at is not null from public.boxes where id = '${boxId}'`);
const codeState = (boxId: string) => psql(`select state from public.inbound_codes where box_id = '${boxId}'`);
const boxRefundDue = (boxId: string) => psql(`select coalesce(public.refund_due_of_box('${boxId}')::text, 'none')`);
const orderRefundDue = (orderId: string) =>
  psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);

describe("도착하지 않은 상자 알림 (INV-W10 · INV-N15)", () => {
  it("INV-W10·N15 (S10·S15): 결제 + 335시간이면 알림 없음, 336시간이면 팬에게 한 번 — 두 번 돌려도 한 번", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 335);
    await runExpiry(g.orderNo);
    expect(alerts(g.orderId)).toBe("");
    backdate(g.orderId, 336);
    expect((await runExpiry(g.orderNo)).box_missing_alerts).toBe(1);
    expect(alerts(g.orderId)).toBe("byeolbit_fan|email");
    expect((await runExpiry(g.orderNo)).box_missing_alerts).toBe(0);
    expect(alerts(g.orderId)).toBe("byeolbit_fan|email");
  });

  it("INV-N15 (S15, 실패경로): 모든 상자가 입고된 주문에는 알림이 없다", async () => {
    const op = await staff();
    const g = await approvedGift(1);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 400);
    await runExpiry(g.orderNo);
    expect(alerts(g.orderId)).toBe("");
  });
});

describe("도착하지 않은 상자 닫기 (INV-W10 · INV-M8·M9)", () => {
  it("INV-W10·M8 (S10·S8d): 결제 + 720시간에 안 온 상자만 닫힌다 — 6자리 무효, 그 상자 금액이 상자 환불 대상, 주문은 계속", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    const qr = await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 719);
    await runExpiry(g.orderNo);
    expect(missing(g.boxIds[1]!)).toBe("f");
    backdate(g.orderId, 720);
    expect((await runExpiry(g.orderNo)).boxes_missing).toBe(1);
    expect(missing(g.boxIds[1]!)).toBe("t");
    expect(missing(g.boxIds[0]!)).toBe("f");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).not.toBe("canceled");
    expect(boxRefundDue(g.boxIds[1]!)).toBe(psql(`select price_krw from public.boxes where id = '${g.boxIds[1]}'`));
    expect(boxRefundDue(g.boxIds[0]!)).toBe("none");
    expect(orderRefundDue(g.orderId)).toBe("none");
    // 두 번 돌려도 같은 상자를 다시 닫지 않는다
    expect((await runExpiry(g.orderNo)).boxes_missing).toBe(0);
    // 닫힌 상자는 주문 집계에서 빠진다 — 도착한 상자가 검수를 마치면 주문이 검수 완료로 간다
    await inspect(op, qr, FAN_PASS);
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("inspected");
  });

  it("INV-W10·M8 (S10b·S8e): 상자가 하나도 안 온 주문은 결제 + 720시간에 취소 — 주문 환불 전액, 상자 환불은 없다", async () => {
    const g = await approvedGift(2);
    backdate(g.orderId, 720);
    await runExpiry(g.orderNo);
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("canceled");
    expect(codeState(g.boxIds[0]!)).toBe("void");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(orderRefundDue(g.orderId)).toBe(psql(`select amount_krw from public.payments where order_id = '${g.orderId}' and kind = 'initial'`));
    expect(boxRefundDue(g.boxIds[0]!)).toBe("none");
    // 대표가 상자 환불을 청구해도 거부 — 주문 환불이 전액을 맡는다
    const owner = await signedInClient("fankkuk_admin");
    for (const boxId of g.boxIds) {
      expect((await owner.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: boxId })).error?.code).toBe("P0022");
    }
    expect(psql(`select count(*) from public.refunds where box_id in ('${g.boxIds.join("','")}')`)).toBe("0");
  });

  it("INV-W10 (S10c, 실패경로): 결제 + 720시간이 지났어도 입고된 상자는 닫지 않고, 출고된 주문은 건드리지 않는다", async () => {
    const op = await staff();
    const g = await approvedGift(1);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 800);
    expect((await runExpiry(g.orderNo)).boxes_missing).toBe(0);
    expect(missing(g.boxIds[0]!)).toBe("f");

    const shipped = await approvedGift(2);
    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'shipped', shipped_at = now() where id = '${shipped.orderId}'; commit;`);
    backdate(shipped.orderId, 800);
    await runExpiry(shipped.orderNo);
    expect(missing(shipped.boxIds[0]!)).toBe("f");
    expect(alerts(shipped.orderId)).toBe("");
  });

  it("INV-W10 (실패경로): 닫힌 상자가 늦게 도착하면 무효 6자리라 보류로 들어가고, 주인의 찾기로도 닫힌 상자에 이어지지 않는다", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 720);
    await runExpiry(g.orderNo);
    const late = waybill();
    const r = await scanInbound(op, late, { code: codeOf({ boxId: g.boxIds[1]! }), ...HOLD_DETAILS });
    expect(r.data).toMatchObject({ result: "hold", reason: "void_code" });
    const found = await (await signedInClient("byeolbit_fan")).rpc("find_held_parcel", {
      p_box_id: g.boxIds[1],
      p_share_id: null,
      p_waybill: late,
      p_carrier: HOLD_DETAILS.carrier,
    });
    expect(found.error).toBeNull();
    expect(found.data).toBe("not_found");
    // 닫힌 상자에는 배송 조회용 송장번호도 넣을 수 없다(화면을 거치지 않고 불러도)
    const set = await (await signedInClient("byeolbit_fan")).rpc("set_box_waybill", { p_box_id: g.boxIds[1], p_waybill: waybill() });
    expect(set.data).toBe("not_found");
    expect(psql(`select count(*) from public.office_parcels where box_id = '${g.boxIds[1]}' and state <> 'awaiting'`)).toBe("0");
  });
});

describe("닫기와 입고가 겹칠 때 (INV-W10 동시)", () => {
  it("INV-W10 (동시): 같은 상자의 30일 닫기와 입고가 겹치면 둘 중 하나만 반영된다 — 닫히고 입고되거나, 입고되고 닫히지 않는다", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 720);
    // 두 처리가 운 좋게 앞뒤로 오지 않게, 그 상자 줄을 잠근 뒤에 둘을 보내 잠금 뒤에 줄 세운다
    const lock = await holdRowLock(`select 1 from public.boxes where id = '${g.boxIds[1]}' for update`, 2);
    const [closed, scanned] = await Promise.all([runExpiry(g.orderNo), scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[1]! }), ...HOLD_DETAILS })]);
    await lock.released;
    expect(scanned.error).toBeNull();
    const result = (scanned.data as { result: string }).result;
    const arrived = psql(`select count(*) from public.office_parcels where box_id = '${g.boxIds[1]}' and state <> 'awaiting'`);
    if (missing(g.boxIds[1]!) === "t") {
      expect(closed.boxes_missing).toBe(1);
      expect(result).toBe("hold");
      expect(arrived).toBe("0");
    } else {
      expect(closed.boxes_missing).toBe(0);
      expect(result).toBe("received");
      expect(arrived).toBe("1");
    }
  });
});

describe("상자마다 나눠 저장한 요금 칸 (INV-M14, 카드 d51)", () => {
  it("INV-M14: 상자마다 등록 순간의 배송비·검수비가 저장되고, 상자 칸의 합은 결제의 칸과 같다", async () => {
    const g = await paidGift(2);
    const sums = psql(
      `select sum(b.shipping_fee_krw) = p.shipping_fee_krw and sum(b.inspection_fee_krw) = p.inspection_fee_krw and sum(b.price_krw) = p.amount_krw
       from public.boxes b join public.payments p on p.order_id = b.order_id and p.kind = 'initial' where b.order_id = '${g.orderId}' group by p.id`,
    );
    expect(sums).toBe("t");
  });

  it("INV-M14 (실패경로): 상자 칸의 합이 결제의 칸과 다르면 DB 가 받지 않는다", async () => {
    const g = await paidGift(2);
    expect(() =>
      psql(`update public.boxes set shipping_fee_krw = shipping_fee_krw + 100, inspection_fee_krw = inspection_fee_krw - 100 where id = '${g.boxIds[0]}'`),
    ).toThrow(/23514|INV-M14/);
  });
});

describe("상자 환불과 주문 환불의 합 (INV-M9)", () => {
  it("INV-M9 (S8d): 상자 환불을 정한 뒤 주문 환불이 생기면 그만큼 빼고, 합계는 결제 금액을 넘지 않는다", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 720);
    await runExpiry(g.orderNo);
    const owner = await signedInClient("fankkuk_admin");
    const claimed = await owner.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] });
    expect(claimed.error).toBeNull();
    const boxAmount = Number(psql(`select price_krw from public.boxes where id = '${g.boxIds[1]}'`));
    expect((claimed.data as { amount_krw: number }[])[0]!.amount_krw).toBe(boxAmount);
    // 같은 상자를 또 청구하면 새 환불을 만들지 않는다
    await owner.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] });
    expect(psql(`select count(*) from public.refunds where box_id = '${g.boxIds[1]}'`)).toBe("1");
    // 그 뒤 도착한 상자가 거절된 것처럼 — 거절 규칙(반송 택배비만 뺀다)을 남은 상자 몫에만 적용한다(카드 d51).
    // 닫힌 상자의 배송비는 이미 상자 환불에 들어 있으니 다시 빼지 않는다. 소형 2개 13,800원이면 상자 환불 6,900 + 주문 환불 2,900.
    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'rejected' where id = '${g.orderId}'; commit;`);
    const [amount, shipping] = psql(`select amount_krw || '|' || shipping_fee_krw from public.payments where order_id = '${g.orderId}' and kind = 'initial'`).split("|").map(Number);
    const boxShipping = Number(psql(`select shipping_fee_krw from public.boxes where id = '${g.boxIds[1]}'`));
    expect(boxShipping).toBeGreaterThan(0);
    expect(Number(orderRefundDue(g.orderId))).toBe(amount! - boxAmount - (shipping! - boxShipping));
    expect(Number(orderRefundDue(g.orderId)) + boxAmount).toBe(amount! - (shipping! - boxShipping));
  });

  it("INV-M9·M17 (S8d, 입고 뒤 취소): 주문 환불은 (결제 금액 − 닫힌 상자 금액) − 도착한 상자의 검수비·배송비 — 닫힌 상자의 칸을 두 번 빼지 않는다", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 720);
    await runExpiry(g.orderNo);
    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'canceled' where id = '${g.orderId}'; commit;`);
    const amount = Number(psql(`select amount_krw from public.payments where order_id = '${g.orderId}' and kind = 'initial'`));
    const closedPrice = Number(psql(`select price_krw from public.boxes where id = '${g.boxIds[1]}'`));
    const arrivedFees = Number(psql(`select inspection_fee_krw + shipping_fee_krw from public.boxes where id = '${g.boxIds[0]}'`));
    // 소형 2개 13,800원이면 (13,800 − 6,900) − (1,500 + 4,000) = 1,400 — 도착한 상자의 기본 서비스료만 남는다
    expect(Number(orderRefundDue(g.orderId))).toBe(amount - closedPrice - arrivedFees);
    // 입고가 있는 주문이라 닫힌 상자의 환불은 그대로 그 상자 금액
    expect(boxRefundDue(g.boxIds[1]!)).toBe(psql(`select price_krw from public.boxes where id = '${g.boxIds[1]}'`));
  });

  it("INV-M9 (동시): 같은 결제의 주문 환불과 상자 환불을 동시에 청구하면 하나는 「처리 중」으로 거부 — 차례로 하면 둘 다, 합계는 결제 금액 이하", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    await receive(op, g.boxIds[0]!);
    backdate(g.orderId, 720);
    await runExpiry(g.orderNo);
    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'rejected' where id = '${g.orderId}'; commit;`);
    const paymentId = psql(`select id from public.payments where order_id = '${g.orderId}' and kind = 'initial'`);
    const owner = await signedInClient("fankkuk_admin");
    const lock = await holdRowLock(`select 1 from public.payments where id = '${paymentId}' for update`, 2);
    const both = await Promise.all([
      owner.rpc("admin_claim_refund", { p_kind: "gift", p_unit_id: paymentId }),
      owner.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] }),
    ]);
    await lock.released;
    expect(both.filter((r) => r.error === null)).toHaveLength(1);
    expect(both.filter((r) => r.error?.code === "P0024")).toHaveLength(1);
    expect(psql(`select count(*) from public.refunds where payment_id = '${paymentId}'`)).toBe("1");
    // 앞 청구가 2분 지나 「처리 중」이 풀린 것처럼 — 차례로 하면 남은 쪽도 들어간다
    psql(`update public.refunds set claimed_at = now() - interval '3 minutes' where payment_id = '${paymentId}'`);
    await owner.rpc("admin_claim_refund", { p_kind: "gift", p_unit_id: paymentId });
    psql(`update public.refunds set claimed_at = now() - interval '3 minutes' where payment_id = '${paymentId}'`);
    await owner.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] });
    expect(psql(`select count(*) from public.refunds where payment_id = '${paymentId}'`)).toBe("2");
    const [amount, shipping] = psql(`select amount_krw || '|' || shipping_fee_krw from public.payments where id = '${paymentId}'`).split("|").map(Number);
    const boxShipping = Number(psql(`select shipping_fee_krw from public.boxes where id = '${g.boxIds[1]}'`));
    // 소형 2개 13,800원이면 6,900 + 2,900 = 9,800 — 빠진 것은 반송한 상자 하나의 택배비
    expect(Number(psql(`select sum(amount_krw) from public.refunds where payment_id = '${paymentId}'`))).toBe(amount! - (shipping! - boxShipping));
  });

  it("INV-M9 (실패경로): 닫히지 않은 상자·직원·팬은 상자 환불을 청구할 수 없다", async () => {
    const op = await staff();
    const g = await approvedGift(2);
    await receive(op, g.boxIds[0]!);
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] })).error).not.toBeNull();
    backdate(g.orderId, 720);
    await runExpiry(g.orderNo);
    for (const who of ["fankkuk_staff", "byeolbit_fan"]) {
      expect((await (await signedInClient(who)).rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] })).error?.code).toBe("42501");
    }
    expect(psql(`select count(*) from public.refunds where box_id = '${g.boxIds[1]}'`)).toBe("0");
  });
});
