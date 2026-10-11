import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { deleteTestBlocks, deleteTestOrders, holdRowLock, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";
import { codeOf, deleteTestUnmatched, FAN_PASS, HOLD_DETAILS, inspect, paidGift, parcelState, scanInbound, waybill, type Unit } from "./office-helpers";

// 끝난 주문의 늦게 오는 상자 (카드 d52 → 2026-10-10 문제집 메모 B8·C10·D10)
// payment INV-M8·M9·M18 S18~S18i · inbound-address-code INV-C3 S3c·S3d·S3e · office-workflow INV-W10 S10d · decline-block INV-D3 · notifications INV-N17 S17·S17b (② 거절 알림 2026-10-12).
// 받는 주소를 본 적이 있는 주문(승인·「먼저 보내기」·도착한 상자 있음)이 끝나면 안 온 상자는 6자리를 살려 두고,
// 주문 환불에 그 상자 금액 − 배송비 칸을 먼저 넣는다. 늦게 오면 선불 반송(더 돌려줄 것 없음), 168시간 안에 안 오면 닫히고 배송비 칸이 상자 환불이 된다.
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
const undeliveredAlerts = (orderId: string) =>
  psql(
    `select coalesce(string_agg(o.kind || '|' || p.login_id || '|' || o.channel, ',' order by o.channel), '') from public.notification_outbox o join public.profiles p on p.id = o.account_id where o.order_id = '${orderId}' and o.kind = 'gift_undelivered'`,
  );
/** 주문의 보낸 팬이 받는 알림 줄 전부(「상자 도착」은 상자마다라 뺀다)를 「종류|팬 아이디|통로」로 */
const fanAlerts = (orderId: string): string[] => {
  const out = psql(
    `select string_agg(n.kind || '|' || p.login_id || '|' || n.channel, ',' order by n.kind, n.channel) from public.notification_outbox n join public.orders o on o.id = n.order_id join public.profiles p on p.id = n.account_id where n.order_id = '${orderId}' and n.account_id = o.fan_id and n.kind <> 'box_arrived'`,
  );
  return out === "" ? [] : out.split(",");
};
const pendingAlerts = (orderId: string) =>
  psql(
    `select string_agg(o.kind || '|' || p.login_id || '|' || o.channel, ',' order by o.channel) from public.notification_outbox o join public.profiles p on p.id = o.account_id where o.order_id = '${orderId}' and o.kind = 'gift_pending_box'`,
  );

/**
 * 살려 둔 시각을 「지금 − gap」으로 옮기고 같은 처리 안에서 자동 처리를 돌린다(돌려주는 값은 닫은 수).
 * 한 처리 안의 now() 는 한 값이라 경계를 밀리초 오차 없이 본다 — 따로 돌리면 그 사이 흐른 시간만큼 기한이 지나 버린다.
 */
function keepThenExpiry(boxId: string, orderNo: string, gap: string): string {
  const out = psql(
    `begin; set local session_replication_role = replica; update public.inbound_codes set kept_at = now() - interval '${gap}' where box_id = '${boxId}'; set local session_replication_role = origin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); select public.office_run_expiry('${orderNo}') ->> 'kept_closed'; commit;`,
  );
  const lines = out.split(/\r?\n/);
  return lines[lines.length - 2]!.trim(); // 마지막 줄은 COMMIT
}

const parcelOf = (boxId: string) => psql(`select coalesce(state::text, '') from public.office_parcels where box_id = '${boxId}'`);

describe("거절 때 아직 안 온 상자 (payment INV-M18 · INV-M8 · inbound-address-code INV-C3)", () => {
  it("INV-M18·M8 (S18): A 만 도착한 2개 주문을 거절하면 A 는 반송 대기, B 의 6자리는 유효, 주문 환불 = (A − A 배송비) + (B − B 배송비)", async () => {
    const g = await paidGift(2);
    const qrA = await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(status(g.orderId)).toBe("rejected");
    expect(parcelState(qrA)).toBe("return_waiting");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    expect(missing(g.boxIds[1]!)).toBe("f");
    const [priceA, shipA] = boxFees(g.boxIds[0]!);
    const [priceB, shipB] = boxFees(g.boxIds[1]!);
    // 소형 2개 13,800원이면 (6,900 − 4,000) × 2 = 5,800 — B 의 배송비 칸 4,000 만 남겨 둔다
    expect(Number(orderRefundDue(g.orderId))).toBe(priceA - shipA + (priceB - shipB));
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect(boxRefundDue(g.boxIds[0]!)).toBe("none");
    // 아직 안 온 B 는 대표 결제 화면에 상자 환불 줄이 없다(닫혀야 생긴다)
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
      // A 는 검수 불합격 줄 — 상품 대금 칸만(0). 위반한 상자가 「입고 뒤 거절」 줄로 택배비만 빼고 돌려받지 않는다. B 는 살려 둔 몫 2,900
      expect(Number(orderRefundDue(g.orderId))).toBe(2900);
    }
  });

  it("INV-M9·M18 (S18g, 실패경로): 거절 전에 온 A 가 중형 초과로 실측되면 0 — 늦게 온 B 는 중형 초과여도 먼저 돌려준 몫을 되찾지 않는다", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    psql(`begin; set local session_replication_role = replica; update public.boxes set measured_tier = 'oversize' where id = '${g.boxIds[0]}'; commit;`);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
    const qrB = await receive(op, g.boxIds[1]!);
    expect(await inspect(op, qrB, FAN_PASS)).toBe("return_waiting");
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    psql(`begin; set local session_replication_role = replica; update public.boxes set measured_tier = 'oversize' where id = '${g.boxIds[1]}'; commit;`);
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
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

  it("INV-M18 (S18b): 거절 뒤 B 가 B 의 6자리로 도착하면 그 주문 상자로 입고 → 검수 → 반송 대기, 상자 환불 없음, 주문 환불은 그대로", async () => {
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
    // 늦게 온 상자에는 상자 환불이 없다 — 그 몫(금액 − 배송비)은 거절 때 주문 환불에 이미 들어 있고, 배송비 칸은 선불 반송에 쓰인다
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect(await inspect(op, qrB, FAN_PASS)).toBe("return_waiting");
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
    expect(status(g.orderId)).toBe("rejected");

    // 대표 화면: B 의 상자 환불 줄은 없고, 상자 환불 청구는 거부된다. 주문 환불은 반송한 상자 둘의 택배비만 뺀 값
    const boss = await owner();
    const rows = (await boss.rpc("admin_payment_rows")).data as { unit_id: string }[];
    expect(rows.find((r) => r.unit_id === g.boxIds[1])).toBeUndefined();
    expect((await boss.rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] })).error?.code).toBe("P0022");
    const paymentId = psql(`select id from public.payments where order_id = '${g.orderId}' and kind = 'initial'`);
    expect((await boss.rpc("admin_claim_refund", { p_kind: "gift", p_unit_id: paymentId })).error).toBeNull();
    expect(Number(psql(`select sum(amount_krw) from public.refunds where payment_id = '${paymentId}'`))).toBe(paid(g.orderId) - 8000);
    // 늦게 온 입고·반송이 안내를 다시 만들지 않는다 — 주문마다 한 번
    expect(pendingAlerts(g.orderId)).toBe("gift_pending_box|byeolbit_fan|email");
  });

  it("INV-M18 (S18b, 실패경로): 늦게 온 B 가 검수에 걸려도 상자 환불은 없고 먼저 돌려준 몫도 그대로, 대표 청구는 거부", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    const qrB = await receive(op, g.boxIds[1]!);
    expect(await inspect(op, qrB, { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" })).toBe("return_waiting");
    expect(boxRefundDue(g.boxIds[1]!)).toBe("none");
    expect((await (await owner()).rpc("admin_claim_refund", { p_kind: "gift_box", p_unit_id: g.boxIds[1] })).error?.code).toBe("P0022");
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
  });

  it("INV-M18·C3 (S18c·S3c): 대표가 B 를 「도착하지 않음」으로 닫으면 상자 환불 = 남겨 둔 B 배송비 칸, B 의 6자리 무효, 닫기 목록에서 빠지고, 그 뒤 온 B 는 보류", async () => {
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
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(4000);
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
    const after = (await boss.rpc("admin_pending_boxes")).data as { box_id: string }[];
    expect(after.find((r) => r.box_id === g.boxIds[1])).toBeUndefined();
    const rows = (await boss.rpc("admin_payment_rows")).data as { unit_id: string; payment_kind: string; refund_krw: number }[];
    expect(rows.find((r) => r.unit_id === g.boxIds[1])).toMatchObject({ payment_kind: "missing_box", refund_krw: 4000 });

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
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
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

  it("INV-M18 (S18f): 「먼저 보내기」를 안 눌렀고 상자가 하나도 안 온 2개 주문을 거절하면 주문 환불 = 전액, 6자리 둘 다 무효, 안내 없음", async () => {
    const g = await paidGift(2);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(codeState(g.boxIds[0]!)).toBe("void");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(Number(orderRefundDue(g.orderId))).toBe(paid(g.orderId));
    expect(pendingAlerts(g.orderId)).toBe("");
  });

  it("INV-C3 (S3c): A 만 도착한 주문을 대표가 입고 뒤 취소해도 B 의 6자리는 살려 둔다 — 안내는 없고, 대표가 닫을 수 있다", async () => {
    const g = await paidGift(2);
    const op = await staff();
    await receive(op, g.boxIds[0]!);
    const r = await (await owner()).rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" });
    expect(r.error).toBeNull();
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    expect(pendingAlerts(g.orderId)).toBe("");
    expect((await (await owner()).rpc("admin_close_pending_box", { p_box_id: g.boxIds[1] })).error).toBeNull();
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(4000);
  });

  it("INV-M18·C3 (S18i·S3d): 「먼저 보내기」를 누른 승인 전 주문은 상자가 하나도 안 왔어도 거절 때 6자리를 살려 두고 상자 금액 − 배송비를 먼저 돌려준다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    expect((await (await signedInClient("byeolbit_fan")).rpc("ack_early_send", { p_order_no: g.orderNo })).error).toBeNull();
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(codeState(g.boxIds[0]!)).toBe("valid");
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
    expect(pendingAlerts(g.orderId)).toBe("gift_pending_box|byeolbit_fan|email");
    const qr = await receive(op, g.boxIds[0]!);
    expect(await inspect(op, qr, FAN_PASS)).toBe("return_waiting");
    expect(Number(orderRefundDue(g.orderId))).toBe(2900);
  });

  it("INV-M18·C3 (S18h·S3e): 살려 둔 상자는 168시간 안에 안 오면 자동 처리가 닫는다 — 167시간이면 그대로, 두 번 돌려도 한 번", async () => {
    const op = await staff();
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    psql(`begin; set local session_replication_role = replica; update public.inbound_codes set kept_at = now() - interval '167 hours' where box_id = '${g.boxIds[1]}'; commit;`);
    expect((await runExpiry(g.orderNo)).kept_closed).toBe(0);
    expect(missing(g.boxIds[1]!)).toBe("f");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    psql(`begin; set local session_replication_role = replica; update public.inbound_codes set kept_at = now() - interval '169 hours' where box_id = '${g.boxIds[1]}'; commit;`);
    expect((await runExpiry(g.orderNo)).kept_closed).toBe(1);
    expect((await runExpiry(g.orderNo)).kept_closed).toBe(0);
    expect(missing(g.boxIds[1]!)).toBe("t");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(4000);
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
    const late = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[1]! }), ...HOLD_DETAILS });
    expect(late.data).toMatchObject({ result: "hold", reason: "void_code" });
  });

  it("INV-M18 (S18h, 경계): 살려 둔 때부터 168시간 「안에」 안 오면 닫는다 — 167시간 59분 59초면 그대로, 정확히 168시간이면 닫힌다", async () => {
    const g = await paidGift(2);
    await aArrived(g);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(keepThenExpiry(g.boxIds[1]!, g.orderNo, "167 hours 59 minutes 59 seconds")).toBe("0");
    expect(missing(g.boxIds[1]!)).toBe("f");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    expect(keepThenExpiry(g.boxIds[1]!, g.orderNo, "168 hours")).toBe("1");
    expect(missing(g.boxIds[1]!)).toBe("t");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(Number(boxRefundDue(g.boxIds[1]!))).toBe(4000);
  });

  it("INV-M18 ③ (S16d·S17 뒤): 취소로 살려 둔 상자도 168시간 안에 안 오면 자동 처리가 닫는다 — 팬의 취소(「먼저 보내기」 뒤)·대표의 입고 뒤 취소 둘 다", async () => {
    const op = await staff();
    const fan = await signedInClient("byeolbit_fan");
    const byFan = await paidGift(2);
    expect((await fan.rpc("ack_early_send", { p_order_no: byFan.orderNo })).error).toBeNull();
    expect((await fan.rpc("cancel_my_gift", { p_order_no: byFan.orderNo })).error).toBeNull();
    const byOwner = await paidGift(2);
    await receive(op, byOwner.boxIds[0]!);
    expect((await (await owner()).rpc("admin_cancel_received_gift", { p_order_no: byOwner.orderNo, p_reason: "1:1 문의" })).error).toBeNull();
    const keptBoxes = [...byFan.boxIds, byOwner.boxIds[1]!];
    expect(keptBoxes.map(codeState)).toEqual(["valid", "valid", "valid"]);
    const fanOrderDue = orderRefundDue(byFan.orderId);
    const ownerOrderDue = orderRefundDue(byOwner.orderId);

    psql(`begin; set local session_replication_role = replica; update public.inbound_codes set kept_at = now() - interval '169 hours' where box_id in ('${keptBoxes.join("','")}'); commit;`);
    expect((await runExpiry(byFan.orderNo)).kept_closed).toBe(2);
    expect((await runExpiry(byOwner.orderNo)).kept_closed).toBe(1);
    expect(keptBoxes.map(missing)).toEqual(["t", "t", "t"]);
    expect(keptBoxes.map(codeState)).toEqual(["void", "void", "void"]);
    // 닫히면 남겨 둔 배송비 칸이 상자 환불이 되고, 주문 환불은 그대로(먼저 넣은 몫)
    expect(keptBoxes.map((b) => Number(boxRefundDue(b)))).toEqual([4000, 4000, 4000]);
    expect(orderRefundDue(byFan.orderId)).toBe(fanOrderDue);
    expect(orderRefundDue(byOwner.orderId)).toBe(ownerOrderDue);
    expect(status(byFan.orderId)).toBe("canceled");
    expect(status(byOwner.orderId)).toBe("canceled");
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
  it("INV-W10 (S10d): A 만 도착한 채 거절된 주문의 B 는 30일 닫기 대상이 아니다 — 결제 + 720시간이어도 살려 둔 지 168시간 전이면 그대로, 도착하면 입고 → 검수 → 반송 대기", async () => {
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

  it("INV-W10·M18: 7일 자동 반려도 같다 — A 만 도착한 주문이 반려되면 B 의 6자리는 유효, 주문 환불은 A 몫 + B 의 금액 − 배송비", async () => {
    const g = await paidGift(2);
    const qrA = await aArrived(g);
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    expect((await runExpiry(g.orderNo)).gifts).toBe(1);
    expect(status(g.orderId)).toBe("expired");
    expect(parcelState(qrA)).toBe("return_waiting");
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    expect(Number(orderRefundDue(g.orderId))).toBe(5800);
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
    // 상자가 일부라도 온 주문에는 거절 알림(INV-N17 ②)이 따로 가지 않는다 — 알림은 주문마다 하나
    for (const id of [declined.orderId, expired.orderId, o1.orderId, o2.orderId]) expect(undeliveredAlerts(id)).toBe("");
  });

  it("INV-N17 (S17, 실패경로): 상자가 모두 도착한 주문·「먼저 보내기」 없이 하나도 안 온 주문의 거절, 팬의 취소에는 안내가 없다", async () => {
    const all = await paidGift(1);
    await aArrived(all);
    expect(await declineAs("haru_creator", all.requestId)).toBe("declined");
    expect(pendingAlerts(all.orderId)).toBe("");

    const none = await paidGift(2);
    expect(await declineAs("haru_creator", none.requestId)).toBe("declined");
    expect(pendingAlerts(none.orderId)).toBe("");

    // 팬이 「먼저 보내기」 뒤 스스로 취소 — 6자리는 살려 두지만 안내는 없다(취소 화면이 같은 말을 보여 준다)
    const self = await paidGift(1);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("ack_early_send", { p_order_no: self.orderNo })).error).toBeNull();
    expect((await fan.rpc("cancel_my_gift", { p_order_no: self.orderNo })).error).toBeNull();
    expect(codeState(self.boxIds[0]!)).toBe("valid");
    expect(pendingAlerts(self.orderId)).toBe("");
    // 상자가 모두 도착한 주문·팬의 취소에는 거절 알림도 없다
    expect(undeliveredAlerts(all.orderId)).toBe("");
    expect(undeliveredAlerts(self.orderId)).toBe("");
  });

  it("INV-N17 ② · INV-N2 (S17b, 실패경로): 「먼저 보내기」를 누르고 하나도 안 온 주문 — 직접 거절·차단 거절·7일 반려 세 경로 모두 팬 몫 줄은 안 온 상자 안내 하나뿐", async () => {
    // 직접 거절
    const declined = await paidGift(1);
    expect((await (await signedInClient("byeolbit_fan")).rpc("ack_early_send", { p_order_no: declined.orderNo })).error).toBeNull();
    expect(await declineAs("haru_creator", declined.requestId)).toBe("declined");

    // 차단 거절 — 차단은 그 팬의 진행 중 주문을 모두 거절하므로 하루에게 진행 중 시드 주문이 없는 하늘로 본다
    const o = await registerTestOrder(1, { senderId: HANEUL });
    const blockedRequest = await payTestOrder(o);
    expect((await (await signedInClient("haneul_fan")).rpc("ack_early_send", { p_order_no: o.orderNo })).error).toBeNull();
    expect(await declineAs("haru_creator", blockedRequest, true)).toBe("declined");

    // 7일 반려
    const expired = await paidGift(1);
    expect((await (await signedInClient("byeolbit_fan")).rpc("ack_early_send", { p_order_no: expired.orderNo })).error).toBeNull();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${expired.orderId}'`);
    expect((await runExpiry(expired.orderNo)).gifts).toBe(1);

    for (const [id, want] of [[declined.orderId, "rejected"], [o.orderId, "rejected"], [expired.orderId, "expired"]] as const) expect(status(id)).toBe(want);
    // 받는 팬이 다르다(별빛·하늘) — 받는 사람 칸을 지우고 팬 몫 줄 전체(종류·통로)를 비교한다
    const rows = [declined.orderId, o.orderId, expired.orderId].map((id) => fanAlerts(id).map((r) => r.replace(/\|[a-z]+_fan\|/, "|팬|")));
    expect(rows).toEqual([0, 1, 2].map(() => ["gift_pending_box|팬|email"]));
    expect(fanAlerts(o.orderId)).toEqual(["gift_pending_box|haneul_fan|email"]);
  });

  it("INV-N17 ② (S2): 「먼저 보내기」 없이 하나도 안 온 주문의 거절은 거절 알림 하나 — 안 온 상자 안내는 없다", async () => {
    const g = await paidGift(2);
    expect(await declineAs("haru_creator", g.requestId)).toBe("declined");
    expect(undeliveredAlerts(g.orderId)).toBe("gift_undelivered|byeolbit_fan|email");
    expect(pendingAlerts(g.orderId)).toBe("");
  });

  it("INV-N17 ② · INV-N2 (S17b): 결제 전 주문이 차단으로 함께 거절되면 그때는 알림이 없고, 그 뒤 결제가 끝나 전액 환불되면 거절 알림 하나 — 차단을 부른 주문과 같은 줄", async () => {
    const o1 = await registerTestOrder(1, { senderId: HANEUL });
    const r1 = await payTestOrder(o1);
    const unpaid = await registerTestOrder(1, { senderId: HANEUL });
    expect(status(unpaid.orderId)).toBe("pending_payment");
    expect(await declineAs("haru_creator", r1, true)).toBe("declined");
    expect(status(unpaid.orderId)).toBe("rejected");
    // 결제 전 — 돌려줄 결제 금액이 아직 없다
    expect(undeliveredAlerts(unpaid.orderId)).toBe("");
    expect(pendingAlerts(unpaid.orderId)).toBe("");
    expect(undeliveredAlerts(o1.orderId)).toBe("gift_undelivered|haneul_fan|email");
    // 결제가 끝나면 주문은 거절 그대로, 환불은 전액(decline-block S8b) — 직접 거절·7일 반려와 같은 거절 알림
    await payTestOrder(unpaid);
    expect(status(unpaid.orderId)).toBe("rejected");
    expect(orderRefundDue(unpaid.orderId)).toBe(String(paid(unpaid.orderId)));
    expect(fanAlerts(unpaid.orderId)).toEqual(fanAlerts(o1.orderId));
    expect(fanAlerts(unpaid.orderId)).toEqual(["gift_undelivered|haneul_fan|email"]);
  });

  it("INV-N17 ② (S17b, 실패경로): 팬이 「먼저 보내기」 없이 스스로 취소한 주문에는 알림이 없다", async () => {
    const g = await paidGift(1);
    expect((await (await signedInClient("byeolbit_fan")).rpc("cancel_my_gift", { p_order_no: g.orderNo })).error).toBeNull();
    expect(status(g.orderId)).toBe("canceled");
    expect(undeliveredAlerts(g.orderId)).toBe("");
    expect(pendingAlerts(g.orderId)).toBe("");
  });
});
