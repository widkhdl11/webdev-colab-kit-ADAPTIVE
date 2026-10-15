import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SEED, adminClient, approveRpc, approveSql, clearWaybillAttempts, deleteTestBlocks, deleteTestOrders, holdRowLock, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";
import {
  approve,
  deleteTestUnmatched,
  FAN_PASS,
  inspect,
  orderStatus,
  parcelState,
  receiveAndLabel,
  scanInbound,
  sentWithAddress,
  waybill,
  type Unit,
  finishPrint,
} from "./office-helpers";

// 거절·팬 차단 스펙(docs/specs/decline-block.md) 중 DB 가 지키는 것.
// 스펙의 이름 → 시드 계정: 하루 = haru_creator(받는 크리에이터) · 달빛·모모 = momo_creator(다른 크리에이터) · 별빛 = haneul_fan(보낸 사람).
// 보낸 사람은 하루·모모에게 보낸 진행 중 시드 주문이 없는 계정이어야 한다 — 차단은 그 사람의 진행 중 주문을 모두 거절하므로(INV-D8),
// 시드 주문이 있는 별빛(byeolbit_fan)으로 차단하면 다른 시험이 읽는 시드 주문까지 거절된다.

const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const MOMO_PROFILE_ID = "00000000-0000-4000-a000-000000000012";
const SENDER = "00000000-0000-4000-a000-000000000005"; // 하늘 — 시드 주문은 모모에게 출고된 한 건뿐
const OTHER = "00000000-0000-4000-a000-000000000004"; // 솜사탕 — 시드 주문은 하루에게 출고된 한 건뿐

/** 시험 주문이 아닌 주문(시드·화면 확인용)의 상태와 요청 상태. 이 파일이 끝날 때 시작 때와 같아야 한다. */
function seedSnapshot(): string {
  return psql(
    "select string_agg(o.order_no || ':' || o.status || ':' || coalesce(r.status::text, '-'), ',' order by o.order_no, r.request_id) from public.orders o left join public.approval_requests r on r.order_id = o.id where o.item_kind not in ('시험 선물', '통합 시험 선물')",
  );
}
let seedBefore = "";

let haru: SupabaseClient;
let momo: SupabaseClient;
let fan: SupabaseClient;
let staff: SupabaseClient;

beforeAll(async () => {
  seedBefore = seedSnapshot();
  haru = await signedInClient("haru_creator");
  momo = await signedInClient("momo_creator");
  fan = await signedInClient("haneul_fan");
  staff = await signedInClient("fankkuk_staff");
});

afterEach(() => {
  deleteTestBlocks();
  deleteTestUnmatched();
});

afterAll(() => {
  // 거절된 시험 요청이 쌓이면 「처리한 요청」(최근 30건)에서 시드 요청을 밀어낸다 — 다음 파일 전에 지운다
  deleteTestOrders();
  expect(seedSnapshot(), "시드 주문이 바뀌었다 — 차단 시험이 시험 주문 아닌 것을 거절했다").toBe(seedBefore);
  psql(`update public.profiles set nickname = '하늘' where id = '${SENDER}'`);
  psql(`update public.profiles set nickname = '솜사탕' where id = '${OTHER}'`);
  psql(`delete from public.follows where fan_id = '${MOMO_PROFILE_ID}' and creator_id = '${SEED.haruCreatorId}'`);
});

type DeclineReply = { result: string; also_declined: string[] };

async function declineFull(client: SupabaseClient, requestId: string, block = false): Promise<DeclineReply> {
  const r = await client.rpc("decline_gift", { p_request_id: requestId, p_block: block });
  if (r.error) throw new Error(`decline_gift 실패: ${r.error.code} ${r.error.message}`);
  return r.data as DeclineReply;
}

async function decline(client: SupabaseClient, requestId: string, block = false): Promise<string> {
  return (await declineFull(client, requestId, block)).result;
}

/** 결제까지 끝난 선물(하늘 → 하루가 기본). 상자 n 개. */
async function giftFrom(boxCount = 1, who: { senderId?: string; creatorId?: string } = {}): Promise<Unit> {
  const o = await registerTestOrder(boxCount, { senderId: SENDER, ...who });
  const requestId = await payTestOrder(o);
  const boxIds = psql(`select string_agg(id::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}'`).split(",");
  return { kind: "box", orderId: o.orderId, orderNo: o.orderNo, requestId, boxIds };
}

/** 보낸 사람(하늘)이 상자 송장번호를 넣는다. */
async function setWaybill(boxId: string, no: string): Promise<void> {
  clearWaybillAttempts(); // 준비 단계의 등록이 하루 10번 한도에 걸리지 않게
  const r = await fan.rpc("set_box_waybill", { p_box_id: boxId, p_waybill: no });
  if (r.error || r.data !== "saved") throw new Error(`set_box_waybill 실패: ${r.error?.code ?? String(r.data)} ${r.error?.message ?? ""}`);
  sentWithAddress(no, { boxId }); // 그 송장으로 온 상자는 이 상자의 받는 주소(6자리)를 달고 온다
}

/** 주문의 상자별 받는 주소 6자리 상태(상자 순서). 발급되지 않았으면 빈 목록 */
function codeStates(orderId: string): string[] {
  const out = psql(
    `select string_agg(c.state, ',' order by b.seq) from public.inbound_codes c join public.boxes b on b.id = c.box_id where b.order_id = '${orderId}'`,
  );
  return out === "" ? [] : out.split(",");
}

function requestRow(requestId: string): string {
  return psql(`select status || '|' || coalesce(decided_at::text, '-') from public.approval_requests where request_id = '${requestId}'`);
}

function orderRow(orderId: string): string {
  return psql(`select status || '|' || coalesce(approved_at::text, '-') from public.orders where id = '${orderId}'`);
}

function activeBlocks(creatorId: string = SEED.haruCreatorId): string[] {
  const out = psql(`select sender_id from public.creator_blocks where creator_id = '${creatorId}' and unblocked_at is null order by sender_id`);
  return out === "" ? [] : out.split("\n");
}

/** 검수까지 끝난 상자 하나(승인 전). 돌려주는 값은 QR. */
async function inspectedBox(g: Unit, boxIndex = 0): Promise<string> {
  const no = waybill();
  await setWaybill(g.boxIds[boxIndex], no);
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
  return qr;
}

/** 결제 완료 + 168시간이 지난 것처럼 등록 시각을 옮긴다(자동 처리는 돌리지 않는다). */
function pastDeadline(orderId: string): void {
  psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${orderId}'`);
}

function momoFollowsHaru(): void {
  psql(`insert into public.follows (fan_id, creator_id) values ('${MOMO_PROFILE_ID}', '${SEED.haruCreatorId}') on conflict do nothing`);
}

describe("INV-D1: 거절과 차단은 받는 크리에이터 본인만, 대상은 서버가 주문에서 읽는다", () => {
  it("INV-D1 S1: 다른 크리에이터가 하루의 주문을 거절·차단하면 없는 요청과 같은 답이고 아무것도 안 바뀐다", async () => {
    const g = await giftFrom();
    const before = [requestRow(g.requestId), orderRow(g.orderId)];
    const missing = await decline(momo, "apr_NOSUCHREQUEST1", true);
    expect(await decline(momo, g.requestId, true)).toBe(missing);
    expect(missing).toBe("not_found");
    expect([requestRow(g.requestId), orderRow(g.orderId)]).toEqual(before);
    expect(activeBlocks(MOMO_CREATOR_ID)).toEqual([]);
    expect(activeBlocks()).toEqual([]);
  });

  it("INV-D1: 팬·운영자가 부르면 없는 요청과 같은 답", async () => {
    const g = await giftFrom();
    expect(await decline(fan, g.requestId, true)).toBe("not_found");
    expect(await decline(staff, g.requestId, false)).toBe("not_found");
    expect(requestRow(g.requestId)).toMatch(/^waiting\|/);
  });

  it("INV-D1 S1b: 함수 인자는 요청 식별값과 차단 여부뿐 — 다른 계정 값을 붙이면 부르지도 못하고, 차단 대상은 주문의 보낸 사람이다", async () => {
    const args = psql(`select pg_get_function_identity_arguments('public.decline_gift'::regproc)`);
    expect(args).toBe("p_request_id text, p_block boolean");
    const g = await giftFrom();
    const forged = await haru.rpc("decline_gift", { p_request_id: g.requestId, p_block: true, p_sender_id: OTHER });
    expect(forged.error).not.toBeNull();
    expect(requestRow(g.requestId)).toMatch(/^waiting\|/);
    expect(await decline(haru, g.requestId, true)).toBe("declined");
    expect(activeBlocks()).toEqual([SENDER]);
  });
});

describe("INV-D2: 거절할 수 있는 주문의 조건", () => {
  it("INV-D2 S2: 검수 완료·승인 대기 주문은 거절된다", async () => {
    const g = await giftFrom();
    await inspectedBox(g);
    expect(await decline(haru, g.requestId)).toBe("declined");
    expect(requestRow(g.requestId)).toMatch(/^declined\|/);
  });

  it("INV-D2 S2b: 승인된 주문은 거부되고 아무것도 안 바뀐다", async () => {
    const g = await giftFrom();
    await approve(g);
    const before = [requestRow(g.requestId), orderRow(g.orderId)];
    expect(await decline(haru, g.requestId, true)).toBe("already");
    expect([requestRow(g.requestId), orderRow(g.orderId)]).toEqual(before);
    expect(activeBlocks()).toEqual([]);
  });

  it("INV-D2 S2c: 7일 자동 반려된 주문은 거부", async () => {
    const g = await giftFrom();
    pastDeadline(g.orderId);
    expect((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).error).toBeNull();
    const before = [requestRow(g.requestId), orderRow(g.orderId)];
    expect(before[0]).toMatch(/^expired\|/);
    expect(await decline(haru, g.requestId)).toBe("already");
    expect([requestRow(g.requestId), orderRow(g.orderId)]).toEqual(before);
  });

  it("INV-D2 S2c: 검수 불합격 반송 건은 거부", async () => {
    const g = await giftFrom();
    const no = waybill();
    await setWaybill(g.boxIds[0], no);
    const qr = await receiveAndLabel(staff, no);
    expect(await inspect(staff, qr, { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" })).toBe("return_waiting");
    const before = [requestRow(g.requestId), orderRow(g.orderId)];
    expect(await decline(haru, g.requestId)).toBe("not_declinable");
    expect([requestRow(g.requestId), orderRow(g.orderId)]).toEqual(before);
  });

  it("INV-D2 S2c: 팬이 취소한 주문은 거부", async () => {
    const g = await giftFrom();
    psql(`update public.orders set status = 'canceled' where id = '${g.orderId}'`);
    expect(await decline(haru, g.requestId)).toBe("not_declinable");
    expect(requestRow(g.requestId)).toMatch(/^waiting\|/);
    expect(orderStatus(g.orderId)).toBe("canceled");
  });

  it("INV-D2 S2c: 출고 송장이 출력된 주문은 거부", async () => {
    const g = await giftFrom();
    const qr = await inspectedBox(g);
    await approve(g);
    expect(finishPrint(qr, waybill())).toBeNull();
    expect(await decline(haru, g.requestId, true)).toBe("already");
    expect(parcelState(qr)).toBe("label_printed");
    expect(orderStatus(g.orderId)).toBe("label_printed");
  });

  it("INV-D2 S2d (실패경로): 168시간이 지나면 자동 처리 전이라도 거절하지 않고 expired — 요청·주문 그대로, 차단도 생기지 않는다", async () => {
    const g = await giftFrom();
    pastDeadline(g.orderId);
    const before = [requestRow(g.requestId), orderRow(g.orderId)];
    expect(await decline(haru, g.requestId)).toBe("expired");
    expect(await decline(haru, g.requestId, true)).toBe("expired");
    expect([requestRow(g.requestId), orderRow(g.orderId)]).toEqual(before);
    expect(activeBlocks()).not.toContain(SENDER);
  });

  it("INV-D2 S2e: 차단으로 함께 거절할 때 168시간이 지난 다른 주문은 건드리지 않는다", async () => {
    const old = await giftFrom();
    pastDeadline(old.orderId);
    const waiting = await giftFrom();
    const trigger = await giftFrom();
    const before = [requestRow(old.requestId), orderRow(old.orderId)];
    const reply = await declineFull(haru, trigger.requestId, true);
    expect(reply.result).toBe("declined");
    expect(reply.also_declined).toContain(waiting.orderNo);
    expect(reply.also_declined).not.toContain(old.orderNo);
    expect([requestRow(old.requestId), orderRow(old.orderId)]).toEqual(before);
    expect(orderStatus(waiting.orderId)).toBe("rejected");
  });

  it("INV-D2 S2d (경계): 결제 뒤 167시간이면 아직 기한 안 — 거절된다", async () => {
    const g = await giftFrom();
    psql(`update public.orders set registered_at = now() - interval '167 hours' where id = '${g.orderId}'`);
    expect(await decline(haru, g.requestId)).toBe("declined");
    expect(requestRow(g.requestId)).toMatch(/^declined\|/);
    expect(orderStatus(g.orderId)).toBe("rejected");
  });

  it("INV-D2 S2e (경계): 차단으로 함께 거절할 때 결제 뒤 167시간인 다른 주문은 아직 함께 거절된다", async () => {
    const near = await giftFrom();
    psql(`update public.orders set registered_at = now() - interval '167 hours' where id = '${near.orderId}'`);
    const trigger = await giftFrom();
    const reply = await declineFull(haru, trigger.requestId, true);
    expect(reply.result).toBe("declined");
    expect(reply.also_declined).toContain(near.orderNo);
    expect(orderStatus(near.orderId)).toBe("rejected");
  });
});

describe("INV-D3: 거절은 요청·주문·상자를 한 처리에서 바꾸고, 그 뒤는 기존 약속이 따른다", () => {
  // 카드 d52(2026-10-08)가 뒤 절반을 다시 바꿨다: 상자가 하나라도 도착한 주문이면 도착 전 상자의 6자리는 살아 있어,
  // 늦게 오면 그 주문 상자로 입고 → 검수 → 반송 대기(선불, payment INV-M18). 상자가 하나도 오지 않은 주문의 거절은
  // 지금처럼 6자리 전부 무효(INV-C3 — 아래 S8b 와 partial-reject-db S18f 가 본다).
  it("INV-D3 S3: 검수 완료 상자는 반송 대기로, 도착 전 상자는 6자리가 살아 있어 도착하면 그 주문 상자로 입고 → 검수 → 반송 대기(payment INV-M18)", async () => {
    const g = await giftFrom(2);
    const qr1 = await inspectedBox(g, 0);
    const no2 = waybill();
    await setWaybill(g.boxIds[1], no2);

    expect(await decline(haru, g.requestId)).toBe("declined");
    expect(requestRow(g.requestId)).toMatch(/^declined\|\d/);
    expect(orderStatus(g.orderId)).toBe("rejected");
    expect(parcelState(qr1)).toBe("return_waiting");
    expect(codeStates(g.orderId)).toEqual(["used", "valid"]);

    const qr2 = await receiveAndLabel(staff, no2);
    expect(await inspect(staff, qr2, FAN_PASS)).toBe("return_waiting");
    expect(orderStatus(g.orderId)).toBe("rejected");
  });

  it("INV-D3 S3b: 거절된 주문은 서명이 와도 승인되지 않고, 팬 응답에 승인 시각이 없고, 송장도 출력되지 않는다", async () => {
    const g = await giftFrom();
    const qr = await inspectedBox(g);
    expect(await decline(haru, g.requestId)).toBe("declined");

    expect((await approveRpc(g.requestId)).data).toBe("not_approvable");
    const mine = await fan.rpc("my_gift", { p_order_no: g.orderNo });
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0].status).toBe("rejected");
    expect(mine.data[0].approved_at).toBeNull();
    const print = finishPrint(qr, waybill());
    expect(print).toBe("55000");
  });

  it("INV-D3 S3c: 입고 전 거절은 전액, 입고 뒤 거절은 반송 택배비를 뺀 금액을 환불한다", async () => {
    const before = await giftFrom();
    const after = await giftFrom();
    const no = waybill();
    await setWaybill(after.boxIds[0], no);
    await receiveAndLabel(staff, no);
    expect(await decline(haru, before.requestId)).toBe("declined");
    expect(await decline(haru, after.requestId)).toBe("declined");

    const due = (orderId: string) =>
      psql(`select p.amount_krw || '|' || p.shipping_fee_krw || '|' || public.refund_due_of_payment(p.id) from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`).split("|").map(Number);
    const [amount1, , due1] = due(before.orderId);
    expect(due1).toBe(amount1);
    const [amount2, shipping2, due2] = due(after.orderId);
    expect(due2).toBe(amount2 - shipping2);
  });
});

describe("INV-D4: 한 승인 요청은 한 번만 결정된다", () => {
  it("INV-D4 S4: 승인과 거절이 동시에 와도 하나만 반영되고 다른 하나는 「이미 처리됨」", async () => {
    const g = await giftFrom();
    const hold = await holdRowLock(`select 1 from public.approval_requests where request_id = '${g.requestId}' for update`, 1.5);
    const t0 = Date.now();
    const [a, d] = await Promise.all([
      approveRpc(g.requestId).then((r) => ({ data: r.data as unknown, ms: Date.now() - t0 })),
      haru
        .rpc("decline_gift", { p_request_id: g.requestId, p_block: false })
        .then((r) => ({ data: (r.data as DeclineReply | null)?.result, error: r.error, ms: Date.now() - t0 })),
    ]);
    await hold.released;
    expect(d.error).toBeNull();
    expect(Math.min(a.ms, d.ms)).toBeGreaterThan(900);
    const outcome = [a.data, d.data].sort();
    expect([["already", "approved"], ["declined", "not_approvable"]]).toContainEqual(outcome);
    const [req, ord] = [requestRow(g.requestId), orderRow(g.orderId)];
    if (a.data === "approved") {
      expect(req).toMatch(/^approved\|/);
      expect(ord).toMatch(/^registered\|\d/);
    } else {
      expect(req).toMatch(/^declined\|/);
      expect(ord).toBe("rejected|-");
    }
  });

  it("INV-D4 S4b: 거절과 7일 자동 반려가 동시에 와도 결정 기록은 하나", async () => {
    const g = await giftFrom();
    pastDeadline(g.orderId);
    const hold = await holdRowLock(`select 1 from public.approval_requests where request_id = '${g.requestId}' for update`, 1.5);
    const t0 = Date.now();
    const [d, x] = await Promise.all([
      haru
        .rpc("decline_gift", { p_request_id: g.requestId, p_block: false })
        .then((r) => ({ data: (r.data as DeclineReply | null)?.result, error: r.error, ms: Date.now() - t0 })),
      staff
        .rpc("office_run_expiry", { p_order_no: g.orderNo })
        .then((r) => ({ data: r.data as { gifts: number } | null, error: r.error, ms: Date.now() - t0 })),
    ]);
    await hold.released;
    expect(d.error).toBeNull();
    expect(x.error).toBeNull();
    expect(Math.min(d.ms, x.ms)).toBeGreaterThan(900);
    const decided = (d.data === "declined" ? 1 : 0) + (x.data?.gifts ?? 0);
    expect(decided).toBe(1);
    const status = orderStatus(g.orderId);
    expect(requestRow(g.requestId)).toMatch(status === "rejected" ? /^declined\|/ : /^expired\|/);
    expect(["rejected", "expired"]).toContain(status);
  });

  it("INV-D4 S4c: 거절된 요청은 다시 거절해도 승인해도 아무것도 안 바뀐다", async () => {
    const g = await giftFrom();
    expect(await decline(haru, g.requestId)).toBe("declined");
    const before = [requestRow(g.requestId), orderRow(g.orderId)];
    expect(await decline(haru, g.requestId, true)).toBe("already");
    expect((await approveRpc(g.requestId)).data).toBe("not_approvable");
    expect([requestRow(g.requestId), orderRow(g.orderId)]).toEqual(before);
    expect(activeBlocks()).toEqual([]);
  });
});

describe("INV-D5: 팬에게는 직접 거절과 차단 거절이 같은 값(거절)이고 7일 반려만 기간 지남이다", () => {
  async function threeWays(): Promise<string[]> {
    const manual = await giftFrom();
    expect(await decline(haru, manual.requestId)).toBe("declined");

    const expired = await giftFrom();
    pastDeadline(expired.orderId);
    expect((await staff.rpc("office_run_expiry", { p_order_no: expired.orderNo })).error).toBeNull();

    // 차단에 따른 거절 — 승인 대기 중이던 다른 주문(승인된 주문은 차단해도 그대로 간다, 카드 d27)
    const blockedWaiting = await giftFrom();
    const trigger = await giftFrom();
    expect(await decline(haru, trigger.requestId, true)).toBe("declined");
    return [manual.orderNo, expired.orderNo, blockedWaiting.orderNo];
  }

  it("INV-D5 S5: 직접 거절·차단 거절은 rejected 로 같고, 7일 반려만 expired — 목록과 상세가 같다", async () => {
    const [manualNo, expiredNo, blockedNo] = await threeWays();
    const want: Record<string, string> = { [manualNo!]: "rejected", [expiredNo!]: "expired", [blockedNo!]: "rejected" };
    const list = await fan.rpc("my_gifts");
    expect(list.error).toBeNull();
    const rows = (list.data as Record<string, unknown>[]).filter((r) => (r.order_no as string) in want);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.status, r.order_no as string).toBe(want[r.order_no as string]);
      expect(r.approved_at).toBeNull();
    }
    for (const [no, status] of Object.entries(want)) {
      const one = await fan.rpc("my_gift", { p_order_no: no });
      expect(one.data[0].status, no).toBe(status);
      expect(one.data[0].approved_at).toBeNull();
    }
  });

  it("INV-D5 S5b: 팬 응답에는 이유·차단 여부·결정한 사람·결정 시각 칸이 없다", async () => {
    const orderNos = await threeWays();
    const one = await fan.rpc("my_gift", { p_order_no: orderNos[2] });
    expect(Object.keys(one.data[0]).sort()).toEqual(
      [
        "order_no", "creator_name", "item_kind", "box_count", "has_electronics_or_metal", "status", "registered_at", "approved_at",
        "received_at", "inspection_result", "inspected_at", "shipped_at", "expected_arrival_date", "delivery", "fan_tracking_no",
      ].sort(),
    );
    const boxes = await fan.rpc("my_gift_boxes", { p_order_no: orderNos[2] });
    // 받는 주소 6자리 칸(inbound-address-code INV-C2)은 거절된 주문에서는 비어 있다(INV-C3) — 거절 이유·차단 칸은 여전히 없다.
    // reported_not_mine 은 그 팬 자신이 「제가 보낸 게 아니에요」를 눌렀는지다(INV-C8).
    expect(Object.keys(boxes.data[0]).sort()).toEqual(["address_code", "box_id", "label", "reported_not_mine", "send_ack_needed", "state", "tier", "waybill_no"]);
    expect(boxes.data[0].address_code).toBeNull();
  });
});

describe("INV-D6: 차단은 보낸 사람 계정 기준, 살아 있는 차단은 쌍마다 하나", () => {
  it("INV-D6 S6: 차단된 팬이 닉네임을 바꿔도 등록이 거부된다", async () => {
    const g = await giftFrom();
    expect(await decline(haru, g.requestId, true)).toBe("declined");
    psql(`update public.profiles set nickname = '새하늘' where id = '${SENDER}'`);
    try {
      await expect(registerTestOrder(1, { senderId: SENDER })).rejects.toThrow(/받을 수 없는 크리에이터/);
    } finally {
      psql(`update public.profiles set nickname = '하늘' where id = '${SENDER}'`);
    }
  });

  // 닉네임은 계정마다 달라서(signup INV-U13, 2026-10-15) 두 계정이 같은 닉네임을 동시에 가질 수는 없다.
  // 같은 뜻을 지금 규칙 안에서 본다 — 차단된 팬이 닉네임을 바꾼 뒤 다른 계정이 그 옛 닉네임을 가져가도, 그 계정은 막히지 않는다.
  it("INV-D6 S6b: 차단된 팬이 쓰던 닉네임을 가진 다른 계정은 등록된다", async () => {
    const g = await giftFrom();
    expect(await decline(haru, g.requestId, true)).toBe("declined");
    psql(`update public.profiles set nickname = '새하늘' where id = '${SENDER}'`);
    psql(`update public.profiles set nickname = '하늘' where id = '${OTHER}'`);
    try {
      const o = await registerTestOrder(1, { senderId: OTHER });
      expect(orderStatus(o.orderId)).toBe("pending_payment");
    } finally {
      psql(`update public.profiles set nickname = '솜사탕' where id = '${OTHER}'`);
      psql(`update public.profiles set nickname = '하늘' where id = '${SENDER}'`);
    }
  });

  it("INV-D6 S6c: 같은 팬의 주문 두 건을 동시에 「거절하며 차단」해도 살아 있는 차단은 하나", async () => {
    const a = await giftFrom();
    const b = await giftFrom();
    const hold = await holdRowLock(`select 1 from public.approval_requests where request_id in ('${a.requestId}', '${b.requestId}') for update`, 1.5);
    const t0 = Date.now();
    const results = await Promise.all([decline(haru, a.requestId, true), decline(haru, b.requestId, true)]);
    expect(Date.now() - t0).toBeGreaterThan(900);
    await hold.released;
    // 하나가 먼저 차단하며 다른 주문까지 거절했으면 두 번째는 「이미 처리됨」이다
    expect(results.sort()).toEqual(["already", "declined"]);
    expect(activeBlocks()).toEqual([SENDER]);
    expect([orderStatus(a.orderId), orderStatus(b.orderId)]).toEqual(["rejected", "rejected"]);
    // 차단이 함께 거절한 쪽의 대기 요청도 거절로 기록된다 — 대기로 남으면 처리한 요청 목록에서 빠진다
    expect([requestRow(a.requestId), requestRow(b.requestId)].map((r) => r.split("|")[0])).toEqual(["declined", "declined"]);
  });

  it("INV-D6: 살아 있는 차단을 같은 쌍에 하나 더 넣으면 DB 제약이 거부한다", async () => {
    const g = await giftFrom();
    expect(await decline(haru, g.requestId, true)).toBe("declined");
    expect(() =>
      psql(`insert into public.creator_blocks (creator_id, sender_id) values ('${SEED.haruCreatorId}', '${SENDER}')`),
    ).toThrow(/creator_blocks_one_active|duplicate key/);
  });

  it("INV-D6 S6d: 크리에이터 계정이 보낸 선물을 거절하며 차단하면 그 크리에이터 계정이 차단된다", async () => {
    momoFollowsHaru();
    const o = await registerTestOrder(1, { senderId: MOMO_PROFILE_ID });
    const requestId = await payTestOrder(o);
    expect(await decline(haru, requestId, true)).toBe("declined");
    expect(activeBlocks()).toEqual([MOMO_PROFILE_ID]);
  });
});

/** 다른 연결에서 sql 을 실행한 채 seconds 동안 쥐고 있다가 되돌린다 — 같은 값을 넣으려는 쪽이 그동안 줄을 선다. */
async function holdThenRollback(sql: string, seconds: number): Promise<{ released: Promise<void> }> {
  const marker = `hold_rollback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const child = spawn(
    "docker",
    ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", `begin; ${sql}; select pg_sleep(${seconds}) as ${marker}; rollback;`],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const done = new Promise<void>((resolve, reject) => child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`holdThenRollback 실패 (${code})`)))));
  for (let i = 0; i < 100; i++) {
    if (psql(`select count(*) from pg_stat_activity where state = 'active' and query like '%as ${marker}%' and pid <> pg_backend_pid()`) === "1") {
      return { released: done };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  throw new Error("holdThenRollback: 시작하지 못했다");
}

/** 잠금을 기다리는 연결이 n 개가 될 때까지 기다린다. */
async function waitForLockWaiters(n: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (Number(psql(`select count(*) from pg_stat_activity where wait_event_type = 'Lock' and pid <> pg_backend_pid()`)) >= n) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("잠금 대기가 생기지 않았다");
}

describe("INV-D7: 차단된 보낸 사람의 새 등록은 DB 등록 함수가 거부한다", () => {
  it("INV-D7 S7·S7d: 결제 전에 거부되고 주문·상자·결제 줄은 하나도 생기지 않는다", async () => {
    const g = await giftFrom();
    expect(await decline(haru, g.requestId, true)).toBe("declined");
    const count = () => psql(`select (select count(*) from public.orders) || '|' || (select count(*) from public.boxes) || '|' || (select count(*) from public.payments)`);
    const before = count();
    const r = await adminClient().rpc("register_order", {
      p_fan_id: SENDER, p_creator_id: SEED.haruCreatorId, p_order_no: "FC-TBLOCKED1", p_item_kind: "시험 선물",
      p_has_electronics_or_metal: false, p_tiers: ["small"], p_toss_order_id: "pay_test_blocked_one",
      p_goods_krw: 0, p_service_fee_krw: 1400, p_inspection_fee_krw: 1500, p_shipping_fee_krw: 4000, p_amount_krw: 6900,
    });
    expect(r.error?.code).toBe("22023");
    // 앱 서버가 이 문구로 「선물을 받을 수 없는 크리에이터예요」(본인 확인 전 크리에이터와 같은 문구)를 고른다
    expect(r.error?.message).toContain("받을 수 없는 크리에이터");
    expect(count()).toBe(before);
  });

  it("INV-D7 S7b: 차단된 팬도 다른 크리에이터에게는 등록된다", async () => {
    const g = await giftFrom();
    expect(await decline(haru, g.requestId, true)).toBe("declined");
    const o = await registerTestOrder(1, { senderId: SENDER, creatorId: MOMO_CREATOR_ID });
    expect(orderStatus(o.orderId)).toBe("pending_payment");
  });

  it("INV-D7 S7c: 등록이 차단 검사를 지난 뒤 차단이 끼어들어도, 차단 뒤에 진행 중으로 남는 주문은 없다", async () => {
    const g = await giftFrom();
    const orderNo = "FC-TRACE7C";
    // 같은 주문번호를 다른 연결이 쥐고 있게 해 등록을 「차단 확인 뒤, 주문 넣기 앞」에 세운다
    const hold = await holdThenRollback(
      `insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal) values ('${orderNo}', '${SENDER}', '${SEED.haruCreatorId}', '시험 선물', false)`,
      2,
    );
    // rpc 는 then 을 부르기 전까지 요청을 보내지 않는다 — 지금 보내게 감싼다
    const register = Promise.resolve(adminClient().rpc("register_order", {
      p_fan_id: SENDER, p_creator_id: SEED.haruCreatorId, p_order_no: orderNo, p_item_kind: "시험 선물",
      p_has_electronics_or_metal: false, p_tiers: ["small"], p_toss_order_id: "pay_test_race_7c",
      p_goods_krw: 0, p_service_fee_krw: 1400, p_inspection_fee_krw: 1500, p_shipping_fee_krw: 4000, p_amount_krw: 6900,
    }));
    await waitForLockWaiters(1);
    const blocking = decline(haru, g.requestId, true);
    await hold.released;
    const [reg, blocked] = await Promise.all([register, blocking]);
    expect(blocked).toBe("declined");
    expect(activeBlocks()).toEqual([SENDER]);
    if (reg.error === null) {
      // 등록이 먼저 끝났다 → 차단이 그 주문을 거절했어야 한다
      expect(psql(`select status from public.orders where order_no = '${orderNo}'`)).toBe("rejected");
    } else {
      expect(reg.error.message).toContain("받을 수 없는 크리에이터");
    }
    // 검수 불합격으로 반송 중인 주문, 승인된 주문, 168시간이 지나 자동 반려를 기다리는 주문은 차단해도 그대로다(INV-D2·D8)
    // — 앞 시험이 남긴 그런 주문은 세지 않는다
    const left = psql(
      `select count(*) from public.orders where fan_id = '${SENDER}' and creator_id = '${SEED.haruCreatorId}' and item_kind = '시험 선물' and approved_at is null and status in ('pending_payment', 'registered', 'received', 'labeled', 'inspected') and inspection_result is distinct from 'returned' and (registered_at is null or registered_at > now() - interval '168 hours')`,
    );
    expect(left).toBe("0");
  });
});

describe("INV-D7 S7c: 차단이 먼저 끝나는 갈래", () => {
  it("INV-D7 S7c: 차단 쪽이 쌍 잠금을 쥔 채 차단 줄을 넣는 동안 온 등록은, 차단이 끝난 뒤 확인해 거부된다", async () => {
    const key = `creator_block:${SEED.haruCreatorId}:${SENDER}`;
    const hold = await holdRowLock(
      `select pg_advisory_xact_lock(hashtextextended('${key}', 0)); insert into public.creator_blocks (creator_id, sender_id) values ('${SEED.haruCreatorId}', '${SENDER}')`,
      1.5,
    );
    const t0 = Date.now();
    const r = await adminClient().rpc("register_order", {
      p_fan_id: SENDER, p_creator_id: SEED.haruCreatorId, p_order_no: "FC-TRACE7D", p_item_kind: "시험 선물",
      p_has_electronics_or_metal: false, p_tiers: ["small"], p_toss_order_id: "pay_test_race_7d",
      p_goods_krw: 0, p_service_fee_krw: 1400, p_inspection_fee_krw: 1500, p_shipping_fee_krw: 4000, p_amount_krw: 6900,
    });
    await hold.released;
    expect(Date.now() - t0).toBeGreaterThan(900);
    expect(r.error?.message).toContain("받을 수 없는 크리에이터");
    expect(psql(`select count(*) from public.orders where order_no = 'FC-TRACE7D'`)).toBe("0");
  });
});

describe("INV-D8: 차단하면 그 팬의 아직 승인하지 않은 진행 중 주문이 모두 거절된다", () => {
  it("INV-D8 S8: 승인 대기·결제 대기는 거절, 승인된 건은 그대로 송장을 뽑을 수 있고, 송장 출력된 건은 그대로 출고된다", async () => {
    const waiting = await giftFrom();
    const waitingInspected = await giftFrom();
    const waitingInspectedQr = await inspectedBox(waitingInspected);
    const unpaid = await registerTestOrder(1, { senderId: SENDER });
    const approved = await giftFrom();
    const approvedQr = await inspectedBox(approved);
    await approve(approved);
    const printed = await giftFrom();
    const printedQr = await inspectedBox(printed);
    await approve(printed);
    const outbound = waybill();
    expect(finishPrint(printedQr, outbound)).toBeNull();

    const reply = await declineFull(haru, waiting.requestId, true);
    expect(reply.result).toBe("declined");
    expect([...reply.also_declined].sort()).toEqual([unpaid.orderNo, waitingInspected.orderNo].sort());

    expect(orderStatus(waiting.orderId)).toBe("rejected");
    // 함께 거절된 승인 대기 주문에도 INV-D3 의 나머지가 그대로 — 검수 완료 상자는 반송 대기
    expect(orderStatus(waitingInspected.orderId)).toBe("rejected");
    expect(parcelState(waitingInspectedQr)).toBe("return_waiting");
    expect(orderStatus(unpaid.orderId)).toBe("rejected");
    // 카드 d27: 이미 승인한 선물은 차단해도 그대로 간다
    expect(orderRow(approved.orderId)).toMatch(/^inspected\|\d/);
    expect(requestRow(approved.requestId)).toMatch(/^approved\|/);
    expect(parcelState(approvedQr)).toBe("inspected");
    expect(finishPrint(approvedQr, waybill())).toBeNull();
    expect(parcelState(approvedQr)).toBe("label_printed");

    // INV-D5: 결제한 적 없는 거절 주문은 차단으로만 생긴다 — 팬 목록·상자 읽기에 나오면 차단을 짐작한다
    const gifts = (await fan.rpc("my_gifts")).data as { order_no: string }[];
    expect(gifts.map((x) => x.order_no)).not.toContain(unpaid.orderNo);
    expect(gifts.map((x) => x.order_no)).toContain(waiting.orderNo);
    expect((await fan.rpc("my_gift_boxes", { p_order_no: unpaid.orderNo })).data).toEqual([]);
    expect((await fan.rpc("my_gift_boxes", { p_order_no: waiting.orderNo })).data).toHaveLength(1);

    expect(orderStatus(printed.orderId)).toBe("label_printed");
    expect((await staff.rpc("office_confirm_shipment", { p_qr: printedQr, p_waybill: outbound })).error).toBeNull();
    expect(orderStatus(printed.orderId)).toBe("shipped");
  });

  it("INV-W9·D8 (실패경로): 결제 전에 차단으로 거절된 주문(등록 시각 없음)은 크리에이터의 받은 선물 읽기에 없고, 결제한 뒤 거절된 주문은 「끝남」으로 있다", async () => {
    const paid = await giftFrom();
    const unpaid = await registerTestOrder(1, { senderId: SENDER });
    const reply = await declineFull(haru, paid.requestId, true);
    expect(reply.also_declined).toContain(unpaid.orderNo);
    // 결제 전에 거절된 주문은 상태가 거절이고 등록 시각(결제 완료 시각)이 없다 — 상태만으로는 걸러지지 않는다
    expect(psql(`select status || '|' || (registered_at is null) from public.orders where id = '${unpaid.orderId}'`)).toBe("rejected|true");
    const r = await haru.rpc("my_incoming_gifts");
    expect(r.error).toBeNull();
    const rows = r.data as { order_no: string; stage: string }[];
    expect(rows.find((x) => x.order_no === unpaid.orderNo)).toBeUndefined();
    // 결제한 주문은 거절돼도 보인다(조건이 없어서 안 나온 것이 아니다)
    expect(rows.find((x) => x.order_no === paid.orderNo)?.stage).toBe("closed");
  });

  it("INV-D8: 상자 둘 중 하나만 출고 송장이 나온 승인 주문도 그대로 간다 — 나머지 상자는 검수를 거쳐 출고할 수 있다", async () => {
    const both = await giftFrom(2);
    const firstQr = await inspectedBox(both, 0);
    const second = waybill();
    await setWaybill(both.boxIds[1], second);
    await approve(both);
    expect(finishPrint(firstQr, waybill())).toBeNull();
    // 주문 상태는 덜 간 상자를 따라 아직 「등록」이다 — 상태만 보고 거르면 이 주문이 거절된다
    expect(orderStatus(both.orderId)).toBe("registered");

    const trigger = await giftFrom();
    expect(await decline(haru, trigger.requestId, true)).toBe("declined");

    expect(orderStatus(both.orderId)).toBe("registered");
    const secondQr = await receiveAndLabel(staff, second);
    expect(await inspect(staff, secondQr, FAN_PASS)).toBe("inspected");
  });

  it("INV-D8 S8d: 차단이 주문을 고른 뒤 잠그기 전에 그 주문의 승인이 끝나면, 그 주문은 승인 그대로 간다", async () => {
    const racing = await giftFrom();
    const racingQr = await inspectedBox(racing);
    const trigger = await giftFrom();
    // 다른 연결이 승인 함수를 부르고 끝내기 전에 멈춘다(요청 줄·주문 줄을 쥔 채) — 차단은 이 주문을 후보로 고른 뒤 잠금에서 기다린다
    const hold = await holdRowLock(approveSql(racing.requestId), 1.5);
    const t0 = Date.now();
    const reply = await declineFull(haru, trigger.requestId, true);
    expect(Date.now() - t0).toBeGreaterThan(900);
    await hold.released;
    expect(reply.result).toBe("declined");
    expect(reply.also_declined).not.toContain(racing.orderNo);
    expect(orderRow(racing.orderId)).toMatch(/^inspected\|\d/);
    expect(requestRow(racing.requestId)).toMatch(/^approved\|/);
    // 승인이 이긴 주문의 검수 완료 상자는 반송 대기로 가지 않는다
    expect(parcelState(racingQr)).toBe("inspected");
  });

  it("INV-D8·D2: 검수 불합격으로 반송 중인 주문은 차단해도 거절로 바뀌지 않는다", async () => {
    const returned = await giftFrom();
    const no = waybill();
    await setWaybill(returned.boxIds[0], no);
    const qr = await receiveAndLabel(staff, no);
    expect(await inspect(staff, qr, { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" })).toBe("return_waiting");
    const before = orderStatus(returned.orderId);
    const trigger = await giftFrom();
    const reply = await declineFull(haru, trigger.requestId, true);
    expect(reply.also_declined).not.toContain(returned.orderNo);
    expect(orderStatus(returned.orderId)).toBe(before);
  });

  it("INV-D8 S8b: 차단 때 결제 대기였던 주문은 결제가 끝나도 거절 그대로, 대기 요청 0건, 환불은 전액", async () => {
    const trigger = await giftFrom();
    const unpaid = await registerTestOrder(1, { senderId: SENDER });
    // 함께 거절될 결제 완료 주문(상자 둘) — 받는 주소 6자리가 발급돼 유효한 상태
    const alsoPaid = await giftFrom(2);
    expect(codeStates(alsoPaid.orderId)).toEqual(["valid", "valid"]);
    const reply = await declineFull(haru, trigger.requestId, true);
    expect(reply.result).toBe("declined");
    expect([...reply.also_declined].sort()).toEqual([alsoPaid.orderNo, unpaid.orderNo].sort());
    // inbound-address-code INV-C3: 차단으로 함께 거절된 주문의 6자리도 같은 처리에서 전부 무효
    expect(codeStates(alsoPaid.orderId)).toEqual(["void", "void"]);
    expect(codeStates(trigger.orderId)).toEqual(["void"]);
    await payTestOrder(unpaid);
    expect(orderStatus(unpaid.orderId)).toBe("rejected");
    // 거절된 뒤 결제가 끝난 주문에는 6자리를 발급하지 않는다
    expect(codeStates(unpaid.orderId)).toEqual([]);
    expect(psql(`select count(*) from public.approval_requests where order_id = '${unpaid.orderId}' and status = 'waiting'`)).toBe("0");
    const [amount, due] = psql(
      `select p.amount_krw || '|' || public.refund_due_of_payment(p.id) from public.payments p where p.order_id = '${unpaid.orderId}' and p.kind = 'initial'`,
    ).split("|").map(Number);
    expect(due).toBe(amount);
    // 결제가 끝났으니 팬의 선물 목록에는 거절로 보인다
    const mine = await fan.rpc("my_gift", { p_order_no: unpaid.orderNo });
    expect(mine.data[0].status).toBe("rejected");
  });

  it("INV-D8 S8c: 같은 팬이 다른 크리에이터에게 보낸 진행 중 주문은 그대로다", async () => {
    const other = await registerTestOrder(1, { senderId: SENDER, creatorId: MOMO_CREATOR_ID });
    const otherRequest = await payTestOrder(other);
    const trigger = await giftFrom();
    expect(await decline(haru, trigger.requestId, true)).toBe("declined");
    expect(orderStatus(other.orderId)).toBe("registered");
    expect(requestRow(otherRequest)).toMatch(/^waiting\|/);
  });
});

describe("INV-D9: 크리에이터는 자기 차단 목록만, 닉네임과 날짜만 본다", () => {
  it("INV-D9 S9: 하루의 차단 2건 — 2줄, 칸은 식별값·닉네임·날짜뿐", async () => {
    const a = await giftFrom();
    expect(await decline(haru, a.requestId, true)).toBe("declined");
    const b = await registerTestOrder(1, { senderId: OTHER });
    expect(await decline(haru, await payTestOrder(b), true)).toBe("declined");

    const r = await haru.rpc("my_blocked_senders");
    expect(r.error).toBeNull();
    const rows = r.data as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["block_id", "blocked_at", "nickname"]);
    expect(rows.map((x) => x.nickname).sort()).toEqual(["솜사탕", "하늘"]);
    expect(JSON.stringify(rows)).not.toMatch(/haneul|somsatang|00000000-0000-4000-a000/);
  });

  it("INV-D9 S9b: 남의 차단은 안 보이고 팬은 0줄, 인자로 크리에이터를 받지 않는다", async () => {
    expect(psql(`select pg_get_function_identity_arguments('public.my_blocked_senders'::regproc)`)).toBe("");
    const toMomo = await registerTestOrder(1, { senderId: SENDER, creatorId: MOMO_CREATOR_ID });
    expect(await decline(momo, await payTestOrder(toMomo), true)).toBe("declined");
    expect(activeBlocks(MOMO_CREATOR_ID)).toEqual([SENDER]);

    expect((await haru.rpc("my_blocked_senders")).data).toEqual([]);
    expect((await momo.rpc("my_blocked_senders")).data).toHaveLength(1);
    expect((await fan.rpc("my_blocked_senders")).data).toEqual([]);
  });
});

describe("INV-D10: 차단 해제는 본인만, 그 쌍만, 과거 주문은 그대로", () => {
  async function haruBlocksByeolbit(): Promise<{ declined: Unit; blockId: string }> {
    const g = await giftFrom();
    expect(await decline(haru, g.requestId, true)).toBe("declined");
    const blockId = psql(`select id from public.creator_blocks where creator_id = '${SEED.haruCreatorId}' and sender_id = '${SENDER}' and unblocked_at is null`);
    return { declined: g, blockId };
  }

  it("INV-D10 S10: 모모가 하루의 차단을 풀려 하면 없는 차단과 같은 답, 차단 그대로", async () => {
    const { blockId } = await haruBlocksByeolbit();
    const r = await momo.rpc("unblock_sender", { p_block_id: blockId });
    const missing = await momo.rpc("unblock_sender", { p_block_id: "00000000-0000-4000-9000-000000000000" });
    expect(r.data).toBe("not_found");
    expect(missing.data).toBe("not_found");
    expect((await fan.rpc("unblock_sender", { p_block_id: blockId })).data).toBe("not_found");
    expect(activeBlocks()).toEqual([SENDER]);
  });

  it("INV-D10 S10b: 하루가 풀면 과거 거절은 그대로이고 새 등록은 받는다", async () => {
    const { declined, blockId } = await haruBlocksByeolbit();
    const before = [requestRow(declined.requestId), orderRow(declined.orderId)];
    expect((await haru.rpc("unblock_sender", { p_block_id: blockId })).data).toBe("unblocked");
    expect(activeBlocks()).toEqual([]);
    expect([requestRow(declined.requestId), orderRow(declined.orderId)]).toEqual(before);
    expect((await haru.rpc("unblock_sender", { p_block_id: blockId })).data).toBe("not_found");
    const o = await registerTestOrder(1, { senderId: SENDER });
    expect(orderStatus(o.orderId)).toBe("pending_payment");
  });

  it("INV-D10: 해제는 그 쌍만 — 하루가 다른 팬을 차단한 줄은 남는다", async () => {
    const { blockId } = await haruBlocksByeolbit();
    const other = await registerTestOrder(1, { senderId: OTHER });
    expect(await decline(haru, await payTestOrder(other), true)).toBe("declined");
    expect((await haru.rpc("unblock_sender", { p_block_id: blockId })).data).toBe("unblocked");
    expect(activeBlocks()).toEqual([OTHER]);
  });
});

describe("처리한 요청 목록의 「차단함」 (스펙 「지금 코드와 다른 점」 둘째 줄)", () => {
  type Decided = { order_no: string; outcome: string };
  const decidedOf = async (orderNos: string[]): Promise<Record<string, string>> => {
    const r = await haru.rpc("my_decided_requests");
    expect(r.error).toBeNull();
    return Object.fromEntries((r.data as Decided[]).filter((d) => orderNos.includes(d.order_no)).map((d) => [d.order_no, d.outcome]));
  };

  it("INV-D8: 차단하며 거절한 주문은 「blocked」, 차단 없이 거절한 주문은 「declined」, 차단 전에 승인한 주문은 「approved」", async () => {
    const plain = await giftFrom(1, { senderId: OTHER });
    expect(await decline(haru, plain.requestId)).toBe("declined");
    const approved = await giftFrom();
    await approve(approved);
    const trigger = await giftFrom();
    expect(await decline(haru, trigger.requestId, true)).toBe("declined");

    expect(await decidedOf([plain.orderNo, approved.orderNo, trigger.orderNo])).toEqual({
      [plain.orderNo]: "declined",
      [approved.orderNo]: "approved",
      [trigger.orderNo]: "blocked",
    });
  });

  it("INV-D8: 차단된 팬이라도 송장이 나간 승인 주문은 「approved」, 차단 전에 따로 거절한 주문은 「declined」 그대로", async () => {
    const earlier = await giftFrom();
    expect(await decline(haru, earlier.requestId)).toBe("declined");
    const printed = await giftFrom();
    const qr = await inspectedBox(printed);
    await approve(printed);
    expect(finishPrint(qr, waybill())).toBeNull();
    const trigger = await giftFrom();
    expect(await decline(haru, trigger.requestId, true)).toBe("declined");

    expect(await decidedOf([earlier.orderNo, printed.orderNo, trigger.orderNo])).toEqual({
      [earlier.orderNo]: "declined",
      [printed.orderNo]: "approved",
      [trigger.orderNo]: "blocked",
    });
  });

  it("INV-D10: 차단을 풀면 과거 거절은 「declined」로 보인다 — 「풀려면 설정에서」 안내가 남지 않게", async () => {
    const trigger = await giftFrom();
    expect(await decline(haru, trigger.requestId, true)).toBe("declined");
    const blockId = psql(`select id from public.creator_blocks where creator_id = '${SEED.haruCreatorId}' and sender_id = '${SENDER}' and unblocked_at is null`);
    expect((await haru.rpc("unblock_sender", { p_block_id: blockId })).data).toBe("unblocked");
    expect(await decidedOf([trigger.orderNo])).toEqual({ [trigger.orderNo]: "declined" });
  });
});
