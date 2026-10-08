import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { deleteTestBlocks, deleteTestOrders, holdRowLock, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";
import { codeOf, deleteTestUnmatched, FAN_PASS, HOLD_DETAILS, inspect, paidGift, parcelState, scanInbound, waybill, type Unit } from "./office-helpers";

// 일부만 도착한 주문의 거절·반려 (카드 d52)
// payment INV-M8·M9·M18 S18~S18f · inbound-address-code INV-C3 S3c · office-workflow INV-W10 S10d · decline-block INV-D3 · notifications INV-N17 S17.
// 상자가 하나라도 도착한 팬 선물 주문이 거절·7일 반려되면, 그때 안 온 상자는 6자리를 살려 두고 그 몫을 주문 환불에서 뺀다.
// 그 상자는 늦게 와서 반송(상자 환불 = 상자 금액 − 배송비 칸)되거나, 대표가 닫아(상자 환불 = 상자 금액 전액) 끝난다.
// 시험 주문은 소형 상자(6,900원 = 배송비 4,000 + 검수비 1,500 + 기본 서비스료 1,400). 기본 팬은 별빛 → 하루.

const HANEUL = "00000000-0000-4000-a000-000000000005"; // 차단 시험의 보낸 사람 — 하루에게 보낸 진행 중 시드 주문이 없다

afterEach(() => {
  deleteTestBlocks();
  deleteTestUnmatched();
  deleteTestOrders();
});

afterAll(() => {
  deleteTestBlocks();
});

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

async function owner(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_admin");
}

/** 6자리로 입고 + 라벨 부착 확인. 돌려주는 값은 내부 QR. */
async function receive(op: SupabaseClient, boxId: string): Promise<string> {
  const r = await scanInbound(op, waybill(), { code: codeOf({ boxId }) });
  expect(r.data).toMatchObject({ result: "received" });
  const qr = (r.data as { qr: string }).qr;
  expect((await op.rpc("office_confirm_label", { p_qr: qr })).error).toBeNull();
  return qr;
}

async function declineAs(login: string, requestId: string, block = false): Promise<string> {
  const r = await (await signedInClient(login)).rpc("decline_gift", { p_request_id: requestId, p_block: block });
  if (r.error) throw new Error(`decline_gift 실패: ${r.error.code} ${r.error.message}`);
  return (r.data as { result: string }).result;
}

async function runExpiry(orderNo: string): Promise<Record<string, number>> {
  const r = await (await staff()).rpc("office_run_expiry", { p_order_no: orderNo });
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Record<string, number>;
}

/** 상자 2개 중 A(첫 상자)만 도착해 검수를 마친 주문 */
async function aArrived(g: Unit): Promise<string> {
  const op = await staff();
  const qr = await receive(op, g.boxIds[0]!);
  expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
  return qr;
}

const status = (orderId: string) => psql(`select status from public.orders where id = '${orderId}'`);
const codeState = (boxId: string) => psql(`select state from public.inbound_codes where box_id = '${boxId}'`);
const missing = (boxId: string) => psql(`select missing_at is not null from public.boxes where id = '${boxId}'`);
const boxRefundDue = (boxId: string) => psql(`select coalesce(public.refund_due_of_box('${boxId}')::text, 'none')`);
const orderRefundDue = (orderId: string) =>
  psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);
const paid = (orderId: string) => Number(psql(`select amount_krw from public.payments where order_id = '${orderId}' and kind = 'initial'`));
const boxFees = (boxId: string) => psql(`select price_krw || '|' || shipping_fee_krw from public.boxes where id = '${boxId}'`).split("|").map(Number) as [number, number];
const pendingAlerts = (orderId: string) =>
  psql(
    `select string_agg(o.kind || '|' || p.login_id || '|' || o.channel, ',' order by o.channel) from public.notification_outbox o join public.profiles p on p.id = o.account_id where o.order_id = '${orderId}' and o.kind = 'gift_pending_box'`,
  );
const parcelOf = (boxId: string) => psql(`select coalesce(state::text, '') from public.office_parcels where box_id = '${boxId}'`);

describe("거절 때 아직 안 온 상자 (payment INV-M18 · INV-M8 · inbound-address-code INV-C3)", () => {
  it("INV-M18·M8 (S18): A 만 도착한 2개 주문을 거절하면 A 는 반송 대기, 주문 환불 = A 금액 − A 배송비, B 의 6자리는 유효하고 B 몫은 환불 대상 아님", async () => {
    const g = await paidGift(2);
    const qrA = await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(status(g.orderId)).toBe("rejected");
    expect(parcelState(qrA)).toBe("return_waiting");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    expect(missing(g.boxIds[1]!)).toBe("f");
    const [priceA, shipA] = boxFees(g.boxIds[0]!);
    // 소형 2개 13,800원이면 6,900 − 4,000 = 2,900
    expect(Number(orderRefundDue(g.orderId))).toBe(priceA - shipA);
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect(boxRefundDue(g.boxIds[0]!)).toBe("none");
    // 아직 안 온 B 는 대표 결제 화면에 상자 환불 줄이 없다(늦게 와서 검수를 통과하거나 닫혀야 생긴다)
    const rows = (await (await owner()).rpc("admin_payment_rows")).data as { unit_id: string }[];
    expect(rows.find((r) => r.unit_id === g.boxIds[1])).toBeUndefined();
  });

  it("INV-M9·M18 (S18g, 실패경로): 거절 전에 도착한 A 가 검수에 걸렸으면(반송·보관) 주문 환불에 A 몫이 없다 — 늦게 온 상자와 같은 판정", async () => {
    for (const outcome of [
      { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" },
      { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" },
    ] as const) {
      const op = await staff();
      const g = await paidGift(2);
      const qrA = await receive(op, g.boxIds[0]!);
      await inspect(op, qrA, outcome);
      expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
      expect(codeState(g.boxIds[1]!)).toBe("valid");
      // 검수 불합격 줄 — 상품 대금 칸만(0). 위반한 상자가 「입고 뒤 거절」 줄로 택배비만 빼고 돌려받지 않는다
      expect(Number(orderRefundDue(g.orderId))).toBe(0);
    }
  });

  it("INV-M9·M18 (S18g, 실패경로): 중형 초과로 실측된 상자는 검수를 통과했어도 검수 불합격 줄 — 먼저 온 A 는 주문 환불에서, 늦게 온 B 는 상자 환불에서 0", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    psql(`begin; set local session_replication_role = replica; update public.boxes set measured_tier = 'oversize' where id = '${g.boxIds[0]}'; commit;`);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(Number(orderRefundDue(g.orderId))).toBe(0);
    const qrB = await receive(op, g.boxIds[1]!);
    expect(await inspect(op, qrB, FAN_PASS)).toBe("return_waiting");
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(2900);
    psql(`begin; set local session_replication_role = replica; update public.boxes set measured_tier = 'oversize' where id = '${g.boxIds[1]}'; commit;`);
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
  });

  it("INV-C3·M18 (S18f, 실패경로): 송장번호만 등록했고 실제로는 하나도 안 온 주문의 거절은 6자리 전부 무효, 안내 없음 — 송장 등록은 도착이 아니다", async () => {
    const g = await paidGift(2);
    const set = await (await signedInClient("byeolbit_fan")).rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: waybill() });
    expect(set.error).toBeNull();
    expect(parcelOf(g.boxIds[0]!)).toBe("awaiting");
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(codeState(g.boxIds[0]!)).toBe("void");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(pendingAlerts(g.orderId)).toBe("");
    expect(Number(orderRefundDue(g.orderId))).toBe(paid(g.orderId));
  });

  it("INV-C3 (S3c): 거절된 주문의 살아 있는 6자리는 팬이 「먼저 보내기」를 눌렀어도 팬 화면에 나오지 않고, B 는 아직 도착 전 상태로 보인다", async () => {
    const g = await paidGift(2);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("ack_early_send", { p_order_no: g.orderNo })).error).toBeNull();
    const before = await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo });
    expect((before.data as { address_code: string | null }[])[1]!.address_code).toBe(codeOf({ boxId: g.boxIds[1]! }));
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    const after = await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo });
    expect(after.error).toBeNull();
    const rows = after.data as { address_code: string | null; state: string }[];
    expect(rows.map((r) => r.address_code)).toEqual([null, null]);
    // 「입고 대기」 — 도착 전 상자의 상태 그대로
    expect(rows[1]!.state).toBe("awaiting");
  });

  it("INV-M18 (S18b): 거절 뒤 B 가 B 의 6자리로 도착하면 그 주문 상자로 입고 → 검수 → 반송 대기, 상자 환불 = B 금액 − B 배송비, 주문 환불은 그대로", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    const scanned = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[1]! }) });
    expect(scanned.error).toBeNull();
    expect(scanned.data).toMatchObject({ result: "received", order_no: g.orderNo });
    expect(codeState(g.boxIds[1]!)).toBe("used");
    const qrB = (scanned.data as { qr: string }).qr;
    expect((await op.rpc("office_confirm_label", { p_qr: qrB })).error).toBeNull();
    // 검수 전에는 아직 환불 대상이 아니다 — 검수에 걸리면 상품 대금 칸만이 되므로
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect(await inspect(op, qrB, FAN_PASS)).toBe("return_waiting");
    const [priceB, shipB] = boxFees(g.boxIds[1]!);
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(priceB - shipB);
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(2900);
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
    expect(status(g.orderId)).toBe("rejected");

    // 대표 화면: B 의 상자 환불 줄이 생기고, 대표가 청구하면 그 금액
    const boss = await owner();
    const rows = (await boss.rpc("admin_payment_rows")).data as { unit_kind: string; unit_id: string; payment_kind: string; refund_status: string; refund_krw: number }[];
    const rowB = rows.find((r) => r.unit_id === g.boxIds[1]);
    expect(rowB).toMatchObject({ unit_kind: "gift_box", payment_kind: "late_box", refund_status: "due", refund_krw: 2900 });
    const claimed = await boss.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] });
    expect(claimed.error).toBeNull();
    expect((claimed.data as { amount_krw: number }[])[0]!.amount_krw).toBe(2900);
    // 두 환불의 합은 반송한 상자 둘의 택배비만 뺀 값
    psql(`update public.refunds set claimed_at = now() - interval '3 minutes' where box_id = '${g.boxIds[1]}'`);
    const paymentId = psql(`select id from public.payments where order_id = '${g.orderId}' and kind = 'initial'`);
    expect((await boss.rpc("admin_claim_refund", { p_kind: "gift", p_unit_id: paymentId })).error).toBeNull();
    expect(Number(psql(`select sum(amount_krw) from public.refunds where payment_id = '${paymentId}'`))).toBe(paid(g.orderId) - 8000);
    // 늦게 온 입고·반송이 안내를 다시 만들지 않는다 — 주문마다 한 번
    expect(pendingAlerts(g.orderId)).toBe("gift_pending_box|byeolbit_fan|email");
  });

  it("INV-M18 (S18b, 실패경로): 늦게 온 B 가 검수에 걸리면 상품 대금 칸만 — 상품 대금이 0 이라 상자 환불 없음, 대표 청구도 거부", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    const qrB = await receive(op, g.boxIds[1]!);
    expect(await inspect(op, qrB, { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" })).toBe("return_waiting");
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect((await (await owner()).rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] })).error?.code).toBe("P0022");
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
  });

  it("INV-M18·C3 (S18c·S3c): 대표가 B 를 「도착하지 않음」으로 닫으면 상자 환불 = B 금액 전액, B 의 6자리 무효, 닫기 목록에서 빠지고, 그 뒤 온 B 는 보류", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    const boss = await owner();
    const listed = (await boss.rpc("admin_pending_boxes")).data as { box_id: string; order_no: string; label: string; amount_krw: number }[];
    expect(listed.find((r) => r.box_id === g.boxIds[1])).toMatchObject({ order_no: g.orderNo, label: `${g.orderNo}-2`, amount_krw: 6900 });
    expect(listed.find((r) => r.box_id === g.boxIds[0])).toBeUndefined();

    expect((await boss.rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] })).error).toBeNull();
    expect(missing(g.boxIds[1]!)).toBe("t");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(6900);
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
    const after = (await boss.rpc("admin_pending_boxes")).data as { box_id: string }[];
    expect(after.find((r) => r.box_id === g.boxIds[1])).toBeUndefined();
    const rows = (await boss.rpc("admin_payment_rows")).data as { unit_id: string; payment_kind: string; refund_krw: number }[];
    expect(rows.find((r) => r.unit_id === g.boxIds[1])).toMatchObject({ payment_kind: "missing_box", refund_krw: 6900 });

    const late = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[1]! }), ...HOLD_DETAILS });
    expect(late.data).toMatchObject({ result: "hold", reason: "void_code" });
    // 닫기가 안내를 다시 만들지 않는다 — 주문마다 한 번
    expect(pendingAlerts(g.orderId)).toBe("gift_pending_box|byeolbit_fan|email");
  });

  it("INV-M18 (S18b, 실패경로): 늦게 온 B 가 검수에서 보관(추적 장치)이면 상자 환불 없음", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    const qrB = await receive(op, g.boxIds[1]!);
    await inspect(op, qrB, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" });
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
  });

  it("INV-M18 (S18d, 실패경로): 직원·팬·크리에이터가 닫으면 42501, 그대로 남는다", async () => {
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    for (const who of ["fankkuk_staff", "byeolbit_fan", "haru_creator"]) {
      const r = await (await signedInClient(who)).rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] });
      expect(r.error?.code).toBe("42501");
    }
    expect(missing(g.boxIds[1]!)).toBe("f");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    // 닫기 목록도 대표·직원(운영자)만 읽는다
    const fanList = await (await signedInClient("byeolbit_fan")).rpc("admin_pending_boxes");
    expect(fanList.data ?? []).toEqual([]);
  });

  it("INV-M18 (S18d, 실패경로): 이미 도착한 상자·이미 닫힌 상자·진행 중 주문의 상자·입고 없이 거절된 주문의 상자·없는 상자는 P0002, 그대로 남는다", async () => {
    const op = await staff();
    const boss = await owner();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    // 도착한 상자 A
    expect((await boss.rpc("admin_close_pending_box", { p_box_id: g.boxIds[0] })).error?.code).toBe("P0002");
    expect(missing(g.boxIds[0]!)).toBe("f");
    // 이미 닫힌 상자
    expect((await boss.rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] })).error).toBeNull();
    expect((await boss.rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] })).error?.code).toBe("P0002");
    // 늦게 도착한 상자
    const h = await paidGift(2);
    await aArrived(h);
    expect(await declineAs("haru_creator", h.requestId)).toBe("declined");
    await receive(op, h.boxIds[1]!);
    expect((await boss.rpc("admin_close_pending_box", { p_box_id: h.boxIds[1] })).error?.code).toBe("P0002");
    expect(missing(h.boxIds[1]!)).toBe("f");
    // 진행 중 주문의 안 온 상자
    const live = await paidGift(2);
    await aArrived(live);
    expect((await boss.rpc("admin_close_pending_box", { p_box_id: live.boxIds[1] })).error?.code).toBe("P0002");
    expect(missing(live.boxIds[1]!)).toBe("f");
    expect(codeState(live.boxIds[1]!)).toBe("valid");
    // 입고 없이 거절된 주문의 상자(6자리 전부 무효 — 이 불변식이 걸리지 않는다)
    const none = await paidGift(2);
    expect(await declineAs("haru_creator", none.requestId)).toBe("declined");
    expect((await boss.rpc("admin_close_pending_box", { p_box_id: none.boxIds[1] })).error?.code).toBe("P0002");
    expect(missing(none.boxIds[1]!)).toBe("f");
    // 없는 상자
    expect((await boss.rpc("admin_close_pending_box", { p_box_id: "00000000-0000-4000-9000-000000000000" })).error?.code).toBe("P0002");
  });

  // 둘을 그 상자 줄 잠금 뒤에 정해진 순서로 줄 세운다 — 먼저 줄 선 쪽이 이기고, 나중 쪽은 잠근 뒤 다시 보고 거부·보류된다
  const queueBehindLock = async (boxId: string, first: () => PromiseLike<unknown>, second: () => PromiseLike<unknown>) => {
    const lock = await holdRowLock(`select 1 from public.boxes where id = '${boxId}' for update`, 2);
    // 클라이언트 호출은 then 이 붙어야 요청을 보낸다 — Promise.resolve 로 바로 보내 먼저 줄 세운다
    const a = Promise.resolve(first());
    await new Promise((r) => setTimeout(r, 400));
    const b = Promise.resolve(second());
    const out = await Promise.all([a, b]);
    await lock.released;
    return out;
  };

  it("INV-M18 (S18e-a, 동시): 입고가 먼저 줄 서면 B 는 그 주문 상자로 입고되고 뒤따른 닫기는 P0002", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    const boss = await owner();
    const [scanned, closed] = (await queueBehindLock(
      g.boxIds[1]!,
      () => scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[1]! }), ...HOLD_DETAILS }),
      () => boss.rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] }),
    )) as [{ data: { result: string } }, { error: { code: string } | null }];
    expect(scanned.data.result).toBe("received");
    expect(closed.error?.code).toBe("P0002");
    expect(missing(g.boxIds[1]!)).toBe("f");
    expect(codeState(g.boxIds[1]!)).toBe("used");
  });

  it("INV-M18 (S18e-b, 동시): 닫기가 먼저 줄 서면 B 는 닫히고 뒤따른 입고는 무효 6자리라 보류", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    const boss = await owner();
    const [closed, scanned] = (await queueBehindLock(
      g.boxIds[1]!,
      () => boss.rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] }),
      () => scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[1]! }), ...HOLD_DETAILS }),
    )) as [{ error: { code: string } | null }, { data: { result: string; reason: string } }];
    expect(closed.error).toBeNull();
    expect(scanned.data).toMatchObject({ result: "hold", reason: "void_code" });
    expect(missing(g.boxIds[1]!)).toBe("t");
    expect(codeState(g.boxIds[1]!)).toBe("void");
  });

  it("INV-M18 (S18f): 상자가 하나도 안 온 2개 주문을 거절하면 지금처럼 주문 환불 = 전액, 6자리 둘 다 무효, 안내 없음", async () => {
    const g = await paidGift(2);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(codeState(g.boxIds[0]!)).toBe("void");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(Number(orderRefundDue(g.orderId))).toBe(paid(g.orderId));
    expect(pendingAlerts(g.orderId)).toBe("");
  });

  it("INV-C3 (S3c): A 만 도착한 주문을 대표가 입고 뒤 취소하면 B 의 6자리는 무효 — 취소에는 예외가 없고 안내도 없다", async () => {
    const g = await paidGift(2);
    const op = await staff();
    await receive(op, g.boxIds[0]!);
    const r = await (await owner()).rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" });
    expect(r.error).toBeNull();
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(pendingAlerts(g.orderId)).toBe("");
    expect((await (await owner()).rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] })).error?.code).toBe("P0002");
  });

  it("INV-C3 (실패경로): 살려 둔 표시는 한 번 적으면 바꾸거나 지울 수 없고, 유효한 6자리에만 적을 수 있다", async () => {
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(() => psql(`update public.inbound_codes set kept_at = null where box_id = '${g.boxIds[1]}'`)).toThrow(/55000|바꿀 수 없다/);
    expect(() => psql(`update public.inbound_codes set kept_at = now() where box_id = '${g.boxIds[0]}'`)).toThrow(/55000|바꿀 수 없다|유효한/);
  });
});

describe("거절·반려된 주문의 안 온 상자와 30일 닫기 (office-workflow INV-W10)", () => {
  it("INV-W10 (S10d): A 만 도착한 채 거절된 주문의 B 는 결제 + 720시간에도 자동으로 닫히지 않고, 도착하면 입고 → 검수 → 반송 대기", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    psql(`update public.orders set registered_at = now() - interval '721 hours' where id = '${g.orderId}'`);
    const ran = await runExpiry(g.orderNo);
    expect(ran.boxes_missing).toBe(0);
    expect(missing(g.boxIds[1]!)).toBe("f");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    expect(psql(`select count(*) from public.notification_outbox where order_id = '${g.orderId}' and kind = 'box_missing'`)).toBe("0");
    const qrB = await receive(op, g.boxIds[1]!);
    expect(await inspect(op, qrB, FAN_PASS)).toBe("return_waiting");
  });

  it("INV-W10·M18: 7일 자동 반려도 같다 — A 만 도착한 주문이 반려되면 B 의 6자리는 유효, 주문 환불은 A 몫만", async () => {
    const g = await paidGift(2);
    const qrA = await aArrived(g);
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    expect((await runExpiry(g.orderNo)).gifts).toBe(1);
    expect(status(g.orderId)).toBe("expired");
    expect(parcelState(qrA)).toBe("return_waiting");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
  });
});

describe("아직 안 온 상자 안내 (notifications INV-N17)", () => {
  it("INV-N17 (S17): 크리에이터 거절·7일 반려·차단 거절 모두 보낸 팬에게 같은 종류의 안내 줄이 주문마다 한 번", async () => {
    // 크리에이터 거절
    const declined = await paidGift(2);
    await aArrived(declined);
    expect(await declineAs("haru_creator", declined.requestId)).toBe("declined");
    expect(pendingAlerts(declined.orderId)).toBe("gift_pending_box|byeolbit_fan|email");

    // 7일 자동 반려 — 두 번 돌려도 한 번
    const expired = await paidGift(2);
    await aArrived(expired);
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${expired.orderId}'`);
    await runExpiry(expired.orderNo);
    await runExpiry(expired.orderNo);
    expect(pendingAlerts(expired.orderId)).toBe("gift_pending_box|byeolbit_fan|email");

    // 차단 거절 — 차단을 부른 주문과 함께 거절된 주문 모두
    const o1 = await registerTestOrder(2, { senderId: HANEUL });
    const r1 = await payTestOrder(o1);
    const blocked: Unit = { kind: "box", orderId: o1.orderId, orderNo: o1.orderNo, requestId: r1, boxIds: psql(`select string_agg(id::text, ',' order by seq) from public.boxes where order_id = '${o1.orderId}'`).split(",") };
    await aArrived(blocked);
    const o2 = await registerTestOrder(2, { senderId: HANEUL });
    await payTestOrder(o2);
    const alsoBox = psql(`select id from public.boxes where order_id = '${o2.orderId}' order by seq limit 1`);
    await receive(await staff(), alsoBox);
    expect(await declineAs("haru_creator", r1, true)).toBe("declined");
    expect(status(o2.orderId)).toBe("rejected");
    expect(pendingAlerts(o1.orderId)).toBe("gift_pending_box|haneul_fan|email");
    expect(pendingAlerts(o2.orderId)).toBe("gift_pending_box|haneul_fan|email");
  });

  it("INV-N17 (S17, 실패경로): 상자가 모두 도착한 주문·하나도 안 온 주문의 거절에는 안내가 없다", async () => {
    const all = await paidGift(1);
    await aArrived(all);
    expect(await declineAs("haru_creator", all.requestId)).toBe("declined");
    expect(pendingAlerts(all.orderId)).toBe("");

    const none = await paidGift(2);
    expect(await declineAs("haru_creator", none.requestId)).toBe("declined");
    expect(pendingAlerts(none.orderId)).toBe("");
  });
});
