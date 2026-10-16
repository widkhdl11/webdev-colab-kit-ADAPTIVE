import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, holdRowLock, psql, registerTestOrder, signedInClient } from "./helpers";
import { approve, codeOf, deleteTestUnmatched, FAN_PASS, HOLD_DETAILS, inspect, paidGift, parcelState, scanInbound, waybill } from "./office-helpers";

// 취소 (payment INV-M16 팬의 입고 전 취소 S16~S16c · INV-M17 대표의 입고 뒤 취소 S17·S17b, 정책 ①).

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

/** 트리거를 거치지 않고 주문 상태만 바꾼다 — 그 상태에 이르는 길이 아니라 그 상태에서의 판정을 볼 때만 */
const forceStatus = (orderId: string, status: string) =>
  psql(`begin; set local session_replication_role = replica; update public.orders set status = '${status}' where id = '${orderId}'; commit;`);

const status = (orderId: string) => psql(`select status from public.orders where id = '${orderId}'`);
const codeState = (boxId: string) => psql(`select state from public.inbound_codes where box_id = '${boxId}'`);
const orderRefundDue = (orderId: string) =>
  psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);
const paid = (orderId: string) => psql(`select amount_krw from public.payments where order_id = '${orderId}' and kind = 'initial'`);

describe("팬의 입고 전 취소 (INV-M16)", () => {
  it("INV-M16 (S16): 받는 주소를 본 적이 없는(승인 전·「먼저 보내기」 안 누름) 입고 전 주문을 보낸 팬이 취소하면 주문 취소, 6자리 전부 무효, 환불 대상은 결제 금액 전액", async () => {
    const g = await paidGift(2);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("cancel_my_gift", { p_order_no: g.orderNo })).error).toBeNull();
    expect(status(g.orderId)).toBe("canceled");
    expect(codeState(g.boxIds[0]!)).toBe("void");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(orderRefundDue(g.orderId)).toBe(paid(g.orderId));
    // 두 번 눌러도 같은 거부(이미 끝난 주문)
    expect((await fan.rpc("cancel_my_gift", { p_order_no: g.orderNo })).error?.code).toBe("P0002");
  });

  it("INV-M16·M18 (S16d): 받는 주소를 본 적이 있으면(「먼저 보내기」·승인) 팬이 취소해도 6자리를 살려 두고, 환불 대상 = 결제 금액 − 상자마다 배송비 칸, 늦게 온 상자는 그 주문 상자로 입고", async () => {
    const op = await staff();
    const fan = await signedInClient("byeolbit_fan");
    const early = await paidGift(2);
    expect((await fan.rpc("ack_early_send", { p_order_no: early.orderNo })).error).toBeNull();
    expect((await fan.rpc("cancel_my_gift", { p_order_no: early.orderNo })).error).toBeNull();
    expect(status(early.orderId)).toBe("canceled");
    expect([codeState(early.boxIds[0]!), codeState(early.boxIds[1]!)]).toEqual(["valid", "valid"]);
    // 소형 2개 13,800원이면 13,800 − 4,000 × 2 = 5,800
    expect(Number(orderRefundDue(early.orderId))).toBe(Number(paid(early.orderId)) - 8000);
    const late = await receive(op, early.boxIds[0]!);
    expect(await inspect(op, late, FAN_PASS)).toBe("return_waiting");
    expect(Number(orderRefundDue(early.orderId))).toBe(Number(paid(early.orderId)) - 8000);

    const approved = await paidGift(1);
    await approve(approved);
    expect((await fan.rpc("cancel_my_gift", { p_order_no: approved.orderNo })).error).toBeNull();
    expect(codeState(approved.boxIds[0]!)).toBe("valid");
    expect(Number(orderRefundDue(approved.orderId))).toBe(2900);
  });

  it("INV-M16 (S16b, 실패경로): 상자 하나라도 입고된 주문은 취소할 수 없고, 남의 팬·크리에이터·익명도 거부 — 그대로 남는다", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await receive(op, g.boxIds[0]!);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("cancel_my_gift", { p_order_no: g.orderNo })).error?.code).toBe("P0002");
    expect(status(g.orderId)).not.toBe("canceled");

    const other = await paidGift(1);
    for (const c of [await signedInClient("daltokki_fan"), await signedInClient("haru_creator")]) {
      expect((await c.rpc("cancel_my_gift", { p_order_no: other.orderNo })).error?.code).toBe("P0002");
    }
    expect((await anonClient().rpc("cancel_my_gift", { p_order_no: other.orderNo })).error).not.toBeNull();
    expect(status(other.orderId)).toBe("registered");
    expect(codeState(other.boxIds[0]!)).toBe("valid");
  });

  it("INV-M16 (S16b, 실패경로): 결제가 끝나지 않은 주문과 입고 없이 거절·반려로 끝난 주문은 취소할 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const unpaid = await registerTestOrder(1);
    expect((await fan.rpc("cancel_my_gift", { p_order_no: unpaid.orderNo })).error?.code).toBe("P0002");
    expect(status(unpaid.orderId)).toBe("pending_payment");
    for (const ended of ["rejected", "expired"]) {
      const g = await paidGift(1);
      forceStatus(g.orderId, ended);
      expect((await fan.rpc("cancel_my_gift", { p_order_no: g.orderNo })).error?.code).toBe("P0002");
      expect(status(g.orderId)).toBe(ended);
    }
  });

  it("INV-M16 (S16c, 동시): 그 상자의 입고와 팬의 취소가 겹치면 하나만 — 취소됐으면 상자는 보류, 입고됐으면 취소는 거부", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const fan = await signedInClient("byeolbit_fan");
    // 둘이 운 좋게 앞뒤로 오지 않게 상자 줄을 잠근 뒤에 보내 잠금 뒤에 줄 세운다
    const lock = await holdRowLock(`select 1 from public.boxes where id = '${g.boxIds[0]}' for update`, 2);
    const [canceled, scanned] = await Promise.all([
      fan.rpc("cancel_my_gift", { p_order_no: g.orderNo }),
      scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0]! }), ...HOLD_DETAILS }),
    ]);
    await lock.released;
    expect(scanned.error).toBeNull();
    const result = (scanned.data as { result: string }).result;
    if (canceled.error === null) {
      expect(status(g.orderId)).toBe("canceled");
      expect(result).toBe("hold");
    } else {
      expect(canceled.error.code).toBe("P0002");
      expect(result).toBe("received");
      expect(status(g.orderId)).not.toBe("canceled");
    }
  });
});

describe("대표의 입고 뒤 취소 (INV-M17)", () => {
  it("INV-M17: 검수를 마친 상자는 취소와 함께 반송 대기로, 아직 검수 전인 상자는 검수 뒤 자동 처리가 반송 대기로 보낸다", async () => {
    const op = await staff();
    const g = await paidGift(2);
    const done = await receive(op, g.boxIds[0]!);
    const later = await receive(op, g.boxIds[1]!);
    await inspect(op, done, FAN_PASS);
    expect(parcelState(done)).toBe("inspected");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" })).error).toBeNull();
    expect(parcelState(done)).toBe("return_waiting");
    expect(parcelState(later)).toBe("labeled");
    await inspect(op, later, FAN_PASS);
    await op.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(parcelState(later)).toBe("return_waiting");
  });

  it("INV-M17 (S17b, 실패경로): 출고 송장을 출력한 상자가 하나라도 있으면 주문이 아직 출고 전이어도 거부", async () => {
    const op = await staff();
    const g = await paidGift(2);
    const qr = await receive(op, g.boxIds[0]!);
    await receive(op, g.boxIds[1]!);
    psql(`begin; set local session_replication_role = replica; update public.office_parcels set state = 'label_printed', outbound_waybill_no = '700000000001' where qr_code = '${qr}'; commit;`);
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" })).error?.code).toBe("P0002");
    expect(status(g.orderId)).not.toBe("canceled");
    expect(psql(`select count(*) from public.order_cancellations where order_id = '${g.orderId}'`)).toBe("0");
  });

  it("INV-M17 (S17c): 검수에 걸린 상자가 있어도 취소된다 — 걸린 상자는 0, 검수 전인 상자는 기본 서비스료 칸만 돌려준다", async () => {
    for (const caughtResult of [
      { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" },
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" },
    ] as Record<string, string>[]) {
      const op = await staff();
      const g = await paidGift(2);
      const caught = await receive(op, g.boxIds[0]!);
      const other = await receive(op, g.boxIds[1]!);
      await inspect(op, caught, caughtResult);
      const owner = await signedInClient("fankkuk_admin");
      expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" })).error).toBeNull();
      expect(status(g.orderId)).toBe("canceled");
      expect(psql(`select count(*) from public.order_cancellations where order_id = '${g.orderId}'`)).toBe("1");
      // 소형: B 6,900 − 검수비 1,500 − 배송비 4,000 = 1,400, A 는 0
      expect(Number(orderRefundDue(g.orderId))).toBe(1400);
      await inspect(op, other, FAN_PASS);
      await op.rpc("office_run_expiry", { p_order_no: g.orderNo });
      expect(parcelState(other)).toBe("return_waiting");
    }
  });

  it("INV-M17 (S17c): 중형 초과로 실측된 상자가 있어도 취소된다 — 그 상자는 0, 검수 전인 상자는 기본 서비스료 칸만 돌려준다", async () => {
    const op = await staff();
    const g = await paidGift(2);
    const over = await receive(op, g.boxIds[0]!);
    const other = await receive(op, g.boxIds[1]!);
    expect((await op.rpc("office_record_measurement", { p_qr: over, p_tier: "oversize" })).data).toEqual({ result: "inspection_failed" });
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" })).error).toBeNull();
    expect(status(g.orderId)).toBe("canceled");
    expect(psql(`select count(*) from public.order_cancellations where order_id = '${g.orderId}'`)).toBe("1");
    // 소형: B 6,900 − 검수비 1,500 − 배송비 4,000 = 1,400, 중형 초과 A 는 0(검수 불합격 줄)
    expect(Number(orderRefundDue(g.orderId))).toBe(1400);
    await inspect(op, other, FAN_PASS);
    await op.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(parcelState(other)).toBe("return_waiting");
  });

  it("INV-M8·M17: 차액 결제를 마친 주문을 입고 뒤 취소하면 차액 결제의 환불은 그 결제의 검수비·배송비 칸을 뺀 값", async () => {
    const op = await staff();
    const g = await paidGift(1);
    await receive(op, g.boxIds[0]!);
    // 차액 결제가 끝난 상태(소형 → 중형: 배송비 1,000 · 검수비 500 · 기본 서비스료 500)
    psql(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, payment_key, settled_at)
       values ('${g.orderId}', 'difference', '${g.boxIds[0]}', 'pay_diff_${g.orderNo.replace("-", "").toLowerCase()}', 2000, 0, 500, 500, 1000, 'done', 'pk_diff_${g.orderId}', now())`,
    );
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" })).error).toBeNull();
    const diffDue = psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${g.orderId}' and p.kind = 'difference'`);
    expect(diffDue).toBe("500");
  });

  it("INV-M17 (S17): 상자 2개 중 1개 입고된 주문을 대표가 사유와 함께 취소 — 기록 한 줄, 도착한 상자는 검수비·배송비를 뺀 값, 안 온 상자는 살려 두고 배송비만 뺀 값", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await receive(op, g.boxIds[0]!);
    const owner = await signedInClient("fankkuk_admin");
    const r = await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의로 취소 요청" });
    expect(r.error).toBeNull();
    expect(status(g.orderId)).toBe("canceled");
    expect(psql(`select count(*) from public.order_cancellations where order_id = '${g.orderId}'`)).toBe("1");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    const feeA = Number(psql(`select inspection_fee_krw + shipping_fee_krw from public.boxes where id = '${g.boxIds[0]}'`));
    const shipB = Number(psql(`select shipping_fee_krw from public.boxes where id = '${g.boxIds[1]}'`));
    // 소형 2개 13,800원이면 13,800 − (1,500 + 4,000) − 4,000 = 4,300
    expect(Number(orderRefundDue(g.orderId))).toBe(Number(paid(g.orderId)) - feeA - shipB);
    expect(Number(orderRefundDue(g.orderId))).toBe(4300);
  });

  it("INV-M17 (S17b, 실패경로): 출고된 주문·입고 전 주문은 거부, 직원·팬은 42501, 사유가 없으면 22023 — 그대로 남는다", async () => {
    const op = await staff();
    const owner = await signedInClient("fankkuk_admin");
    const g = await paidGift(1);
    await receive(op, g.boxIds[0]!);
    for (const who of ["fankkuk_staff", "byeolbit_fan"]) {
      expect((await (await signedInClient(who)).rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "사유" })).error?.code).toBe("42501");
    }
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: " " })).error?.code).toBe("22023");
    expect(status(g.orderId)).not.toBe("canceled");

    const notYet = await paidGift(1);
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: notYet.orderNo, p_reason: "사유" })).error?.code).toBe("P0002");

    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'shipped', shipped_at = now() where id = '${g.orderId}'; commit;`);
    expect((await owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "사유" })).error?.code).toBe("P0002");
    expect(status(g.orderId)).toBe("shipped");
    expect(psql(`select count(*) from public.order_cancellations where order_id in ('${g.orderId}', '${notYet.orderId}')`)).toBe("0");
  });
});

describe("크리에이터 사정으로 취소 (INV-M21)", () => {
  const cancelForCreator = async (orderNo: string, reason: string, login = "fankkuk_admin") =>
    (await signedInClient(login)).rpc("admin_cancel_for_creator", { p_order_no: orderNo, p_reason: reason });
  const cancellation = (orderId: string) =>
    psql(`select coalesce((select kind || '|' || reason from public.order_cancellations where order_id = '${orderId}'), 'none')`);

  it("INV-M21 (S21): 상자 2개 중 A 만 입고·검수된 승인 주문을 대표가 사유와 함께 취소 — 기록 한 줄, 환불 = (A − 배송비) + (살려 둔 B − 배송비), A 는 반송 대기", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await approve(g);
    const qrA = await receive(op, g.boxIds[0]!);
    await inspect(op, qrA, FAN_PASS);
    expect((await cancelForCreator(g.orderNo, "크리에이터 탈퇴 요청")).error).toBeNull();
    expect(status(g.orderId)).toBe("canceled");
    expect(cancellation(g.orderId)).toBe("creator|크리에이터 탈퇴 요청");
    expect(parcelState(qrA)).toBe("return_waiting");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    // 소형 2개 13,800원이면 (6,900 − 4,000) + (6,900 − 4,000) = 5,800 — 검수비는 빼지 않는다(입고 뒤 취소 4,300 과 다르다)
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
  });

  it("INV-M21: 상자가 하나도 오지 않은 진행 중 주문도 취소된다 — 받는 주소를 본 적이 없으면 6자리는 무효, 환불은 전액", async () => {
    const g = await paidGift(1);
    expect((await cancelForCreator(g.orderNo, "탈퇴")).error).toBeNull();
    expect(status(g.orderId)).toBe("canceled");
    expect(codeState(g.boxIds[0]!)).toBe("void");
    expect(orderRefundDue(g.orderId)).toBe(paid(g.orderId));
  });

  it("INV-M8·M21: 차액 결제를 마친 주문을 크리에이터 사정으로 취소하면 차액 결제의 환불은 배송비 칸만 뺀 값", async () => {
    const op = await staff();
    const g = await paidGift(1);
    await receive(op, g.boxIds[0]!);
    psql(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, payment_key, settled_at)
       values ('${g.orderId}', 'difference', '${g.boxIds[0]}', 'pay_diff_${g.orderNo.replace("-", "").toLowerCase()}', 2000, 0, 500, 500, 1000, 'done', 'pk_diff_${g.orderId}', now())`,
    );
    expect((await cancelForCreator(g.orderNo, "탈퇴")).error).toBeNull();
    const diffDue = psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${g.orderId}' and p.kind = 'difference'`);
    expect(diffDue).toBe("1000");
  });

  it("INV-M21 (S21b, 실패경로): 출고된 주문·출고 송장을 출력한 상자가 있는 주문은 거부, 직원·팬·크리에이터는 42501, 사유가 없거나 201자면 22023 — 그대로 남는다", async () => {
    const op = await staff();
    const g = await paidGift(2);
    const qr = await receive(op, g.boxIds[0]!);
    for (const who of ["fankkuk_staff", "byeolbit_fan", "haru_creator"]) {
      expect((await cancelForCreator(g.orderNo, "사유", who)).error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_cancel_for_creator", { p_order_no: g.orderNo, p_reason: "사유" })).error).not.toBeNull();
    expect((await cancelForCreator(g.orderNo, " ")).error?.code).toBe("22023");
    expect((await cancelForCreator(g.orderNo, "가".repeat(201))).error?.code).toBe("22023");
    expect(status(g.orderId)).not.toBe("canceled");

    psql(`begin; set local session_replication_role = replica; update public.office_parcels set state = 'label_printed', outbound_waybill_no = '700000000002' where qr_code = '${qr}'; commit;`);
    expect((await cancelForCreator(g.orderNo, "사유")).error?.code).toBe("P0002");
    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'shipped', shipped_at = now() where id = '${g.orderId}'; commit;`);
    expect((await cancelForCreator(g.orderNo, "사유")).error?.code).toBe("P0002");
    expect(status(g.orderId)).toBe("shipped");
    expect((await cancelForCreator("FC-TNONE01", "사유")).error?.code).toBe("P0002");
    expect(cancellation(g.orderId)).toBe("none");
  });

  it("INV-M21 (S21c): 추적기 보관 상자가 있는 주문을 크리에이터 사정으로 취소하면 주문은 취소, 그 상자는 추적기 보관 그대로이고 환불 몫은 0", async () => {
    const op = await staff();
    const g = await paidGift(2);
    const caught = await receive(op, g.boxIds[0]!);
    const other = await receive(op, g.boxIds[1]!);
    expect(await inspect(op, caught, { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" })).toBe("tracker_held");
    await inspect(op, other, FAN_PASS);
    expect((await cancelForCreator(g.orderNo, "탈퇴")).error).toBeNull();
    expect(status(g.orderId)).toBe("canceled");
    expect(parcelState(caught)).toBe("tracker_held");
    expect(parcelState(other)).toBe("return_waiting");
    await op.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(parcelState(caught)).toBe("tracker_held");
    // 추적기 상자 0 + 통과한 상자 6,900 − 4,000 = 2,900
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
  });
});
