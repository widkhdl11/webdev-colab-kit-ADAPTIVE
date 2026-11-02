import { spawn } from "node:child_process";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readCreatorActionItems } from "@/entities/action-item/api/read-action-items";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { createInvoiceDecryptor, type InvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import {
  adminClient,
  approveRpc,
  creatorActorOf,
  deleteTestOrders,
  holdRowLock,
  psql,
  recordSignTx,
  SEED,
  settleArgs,
  signedInClient,
  startSignRpc,
} from "./helpers";
import { ADDRESS_CREATOR_ID, decryptFileText, logRows, OWNER_ID, putTestEnvelope, sealTestAddress, testKeyPair, type TestKeys } from "./invoice-helpers";
import { approve, deleteTestUnmatched, FAN_PASS, fanSetsWaybill, inspect, paidGift, parcelState, receiveAndLabel, waybill, type Unit } from "./office-helpers";
import { createTestCreator, removeTestCreator } from "./test-creator";

// 크리에이터의 승인 취소 (approval-cancel INV-AC1~AC6, 시나리오 AC1~AC6).
// 취소 함수(cancel_approval)는 앱 서버 키 전용 — 라우트가 세션에서 확인한 사람 ID 를 넘긴다(승인 서명 요청과 같은 방식).
// 입고 = 그 주문의 상자가 하나라도 사무실에 도착(입고 스캔)한 것. 판정은 DB 가 취소를 처리하는 순간의 상자 기록으로 한다.

const MOMO_PROFILE_ID = "00000000-0000-4000-a000-000000000012";
// 승인 기한(결제 완료부터) — 규칙 값은 상수에서 읽는다
const DEADLINE_HOURS = APPROVAL_DEADLINE_DAYS * 24;

let keys: TestKeys;
let decryptor: InvoiceDecryptor;
const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_PUBLISHABLE_KEY: process.env.FK_TEST_ANON_KEY });

beforeAll(async () => {
  keys = await testKeyPair();
  deleteTestOrders();
  removeTestCreator();
  createTestCreator();
  putTestEnvelope(await sealTestAddress(keys, ADDRESS_CREATOR_ID));
  decryptor = createInvoiceDecryptor(env(), () => decryptFileText(keys), waybill);
});

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
});

afterAll(() => {
  deleteTestOrders();
  removeTestCreator();
});

type CancelRow = { result: string; phase: string | null };

async function cancel(requestId: string, actor: string | null = creatorActorOf(requestId)): Promise<CancelRow> {
  const r = await adminClient().rpc("cancel_approval", { p_actor_id: actor, p_request_id: requestId });
  if (r.error) throw new Error(`cancel_approval 실패: ${r.error.message}`);
  return (Array.isArray(r.data) ? r.data[0] : r.data) as CancelRow;
}

type TargetRow = { request_id: string; order_no: string; cancelable: boolean; arrived_box_count: number; approval_deadline_at: string };

async function targets(actor: string): Promise<TargetRow[]> {
  const r = await adminClient().rpc("my_approval_cancel_targets", { p_actor_id: actor });
  if (r.error) throw new Error(`my_approval_cancel_targets 실패: ${r.error.message}`);
  return r.data as TargetRow[];
}

/** 승인 요청·주문의 승인 상태 한 줄 — 「요청 상태|주문 승인 시각 있음|주문 상태」 */
const approvalState = (g: Unit) =>
  psql(
    `select q.status || '|' || (o.approved_at is not null)::text || '|' || o.status from public.approval_requests q join public.orders o on o.id = q.order_id where q.request_id = '${g.requestId}'`,
  );
const signatureCount = (g: Unit) => Number(psql(`select count(*) from public.approval_signatures where request_id = '${g.requestId}'`));
const cancellations = (g: Unit) =>
  psql(`select phase || ':' || canceled_by from public.approval_cancellations where order_id = '${g.orderId}' order by canceled_at`)
    .split("\n")
    .filter((l) => l !== "");
/** 그 결제의 주문 환불 금액(payment INV-M8 — 서버가 상태로 정한다) */
const refundDue = (orderId: string) =>
  psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);
/** 상자마다 그 상자 금액 − 배송비 칸의 합(INV-M8 「입고 뒤 거절」 줄·INV-M18 살려 둔 상자) */
const priceMinusShipping = (orderId: string) => psql(`select sum(price_krw - shipping_fee_krw)::text from public.boxes where order_id = '${orderId}'`);

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}
const print = async (qr: string) => decryptor({ qr, accessToken: await tokenOf("fankkuk_admin") });

/** 상자 하나를 사무실에 도착시킨다(송장번호 → 입고 스캔·라벨) — 돌려주는 값은 내부 QR */
async function arrive(boxId: string): Promise<string> {
  const no = waybill();
  await fanSetsWaybill(boxId, no);
  const staff = await signedInClient("fankkuk_staff");
  return receiveAndLabel(staff, no);
}

describe("INV-AC1·AC2: 입고 전 취소는 승인을 무효로 표시하고 승인 대기로 되돌린다", () => {
  it("INV-AC1·INV-AC2 AC1: 승인된 주문, 상자 0개 도착 → 취소하면 승인 대기. 승인·서명 기록은 그대로(무효 표시), 다시 「승인」은 새 서명 요청", async () => {
    const g = await paidGift(1);
    await approve(g);
    const signatureId = psql(`select id from public.approval_signatures where request_id = '${g.requestId}'`);

    expect(await cancel(g.requestId)).toEqual({ result: "canceled", phase: "before_inbound" });
    expect(approvalState(g)).toBe("waiting|false|registered");
    // 승인·서명 기록은 지우지 않는다(INV-S12·S14) — 취소 기록이 그 서명을 가리켜 무효로 표시한다
    expect(signatureCount(g)).toBe(1);
    expect(cancellations(g)).toEqual([`before_inbound:${SEED.creatorProfileId}`]);
    expect(psql(`select signature_id from public.approval_cancellations where order_id = '${g.orderId}'`)).toBe(signatureId);

    // 다시 승인 — 새 서명 요청(already 가 아니다)
    const restarted = await startSignRpc(g.requestId);
    expect(restarted.result).toBe("started");
    expect(restarted.sign_request_id).not.toBe(psql(`select sign_request_id from public.approval_signatures where id = '${signatureId}'`));
    expect((await approveRpc(g.requestId)).data).toBe("approved");
    expect(approvalState(g)).toBe("approved|true|registered");
    expect(signatureCount(g)).toBe(2);
    // 다시 취소할 수 있다 — 몇 번이든
    expect(await cancel(g.requestId)).toEqual({ result: "canceled", phase: "before_inbound" });
    expect(cancellations(g)).toHaveLength(2);
  });

  it("INV-AC1 (화면 done-before): 입고 전 취소 뒤 크리에이터 처리할 일 읽기에 그 주문의 승인 요청이 다시 나온다", async () => {
    const g = await paidGift(1);
    await approve(g);
    const haru = await signedInClient("haru_creator");
    const approvalOf = async () => (await readCreatorActionItems(haru)).find((it) => it.kind === "approval" && it.orderNo === g.orderNo);
    // 승인된 동안에는 처리할 일에 승인 요청이 없다 — 비교 기준
    expect(await approvalOf()).toBeUndefined();
    expect(await cancel(g.requestId)).toEqual({ result: "canceled", phase: "before_inbound" });
    expect(await approvalOf()).toMatchObject({ kind: "approval", requestId: g.requestId });
  });

  it("INV-AC1 (실패경로): 승인되지 않은 주문·이미 취소한 주문은 취소하지 않는다 — 기록이 생기지 않는다", async () => {
    const g = await paidGift(1);
    expect(await cancel(g.requestId)).toEqual({ result: "not_approved", phase: null });
    await approve(g);
    await cancel(g.requestId);
    expect(await cancel(g.requestId)).toEqual({ result: "not_approved", phase: null });
    expect(cancellations(g)).toHaveLength(1);
  });

  it("INV-AC1 AC1b·INV-AC4: 상자 2개 중 1개 도착 → 취소하면 거절로 끝난다. 같은 상태로 「먼저 보내기」 뒤 거절한 주문과 상태·환불·반송·팬 알림이 같다", async () => {
    const g = await paidGift(2);
    await approve(g);
    const qr = await arrive(g.boxIds[0]!);
    expect((await targets(creatorActorOf(g.requestId)!)).find((t) => t.order_no === g.orderNo)).toMatchObject({ cancelable: true, arrived_box_count: 1 });

    // 지금의 거절: 승인 전 「먼저 보내기」(주소를 봄) → 같은 상자 도착 → 크리에이터 거절
    const twin = await paidGift(2);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("ack_early_send", { p_order_no: twin.orderNo })).error).toBeNull();
    const twinQr = await arrive(twin.boxIds[0]!);
    const haru = await signedInClient("haru_creator");
    expect(((await haru.rpc("decline_gift", { p_request_id: twin.requestId, p_block: false })).data as { result: string }).result).toBe("declined");

    expect(await cancel(g.requestId)).toEqual({ result: "canceled", phase: "after_inbound" });
    expect(approvalState(g)).toBe("declined|false|rejected");
    expect(approvalState(twin)).toBe("declined|false|rejected");
    expect(cancellations(g)).toEqual([`after_inbound:${SEED.creatorProfileId}`]);
    // 도착한 상자의 단계(반송 흐름)가 거절과 같다
    expect(parcelState(qr)).toBe(parcelState(twinQr));
    // 환불: 도착한 상자는 상자 금액 − 배송비 칸, 안 온 상자는 INV-M18(살려 둠 — 상자 금액 − 배송비 칸)
    expect(refundDue(g.orderId)).toBe(priceMinusShipping(g.orderId));
    expect(refundDue(g.orderId)).toBe(refundDue(twin.orderId));
    const keptOf = (u: Unit) => psql(`select (kept_at is not null)::text from public.inbound_codes where box_id = '${u.boxIds[1]}'`);
    expect(keptOf(g)).toBe("true");
    expect(keptOf(twin)).toBe("true");
    // 팬 알림 종류가 같다
    const fanNotices = (u: Unit) => psql(`select coalesce(string_agg(kind, ',' order by kind), '') from public.notification_outbox where order_id = '${u.orderId}' and account_id = '${SEED.fanId}'`);
    expect(fanNotices(g)).toBe(fanNotices(twin));
  });

  it("INV-AC1 (실패경로): 입고 판정은 취소하는 순간의 상자 기록 — 승인 직후 비어 있던 주문도 취소 전에 상자가 오면 거절로 끝난다", async () => {
    const g = await paidGift(1);
    await approve(g);
    expect((await targets(creatorActorOf(g.requestId)!)).find((t) => t.order_no === g.orderNo)?.arrived_box_count).toBe(0);
    await arrive(g.boxIds[0]!);
    expect(await cancel(g.requestId)).toEqual({ result: "canceled", phase: "after_inbound" });
    expect(approvalState(g)).toBe("declined|false|rejected");
  });
});

describe("INV-AC2: 취소한 승인의 서명으로는 다시 승인되지 않고, 승인 기한은 늘지 않는다", () => {
  it("INV-AC2 AC2: 취소 전 서명의 결과가 취소 뒤 다시 와도 승인되지 않는다", async () => {
    const g = await paidGift(1);
    const started = await startSignRpc(g.requestId);
    const actor = creatorActorOf(g.requestId);
    await recordSignTx(started.sign_request_id!, actor);
    expect((await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, actor, started.plaintext!))).data).toBe("approved");
    await cancel(g.requestId);
    const again = await adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, actor, started.plaintext!));
    expect(again.data).not.toBe("approved");
    expect(approvalState(g)).toBe("waiting|false|registered");
    expect(signatureCount(g)).toBe(1);
  });

  it("INV-AC2 AC2: 취소 전에 시작된 서명 요청은 취소 때 끝난다 — 그 결과가 뒤에 와도 승인되지 않는다", async () => {
    const g = await paidGift(1);
    await approve(g);
    // 승인된 동안 기다리는 서명 요청이 하나 남아 있던 경우(화면이 겹친 탭 등) — 준비 한 줄
    const plain = psql(`select public.approval_sign_plaintext_of_order('${g.orderId}')`);
    const pendingId = psql(
      `insert into public.approval_sign_requests (approval_request_id, plaintext, method, gateway_tx_id, created_at, expires_at) values ('${g.requestId}', '${plain.replace(/'/g, "''")}', 'fake', 'fake-tx-early', now(), now() + interval '5 minutes') returning id`,
    ).split("\n")[0]!;
    await cancel(g.requestId);
    expect(psql(`select state from public.approval_sign_requests where id = '${pendingId}'`)).toBe("failed");
    const r = await adminClient().rpc("settle_approval_sign", settleArgs(pendingId, creatorActorOf(g.requestId), plain));
    expect(r.data).not.toBe("approved");
    expect(approvalState(g)).toBe("waiting|false|registered");
  });

  it("INV-AC2 AC2 (실패경로): 취소보다 먼저 만들어진 서명 요청은 승인 함수가 받아도 서명 기록이 들어가지 않는다(DB 가 막는다)", async () => {
    const g = await paidGift(1);
    await approve(g);
    await cancel(g.requestId);
    // 취소 처리보다 1초 앞서 만들어진 것으로 적힌 기다리는 요청(취소 때 끝내기를 비켜 간 경우를 흉내 낸다)
    const plain = psql(`select public.approval_sign_plaintext_of_order('${g.orderId}')`);
    const early = psql(
      `insert into public.approval_sign_requests (approval_request_id, plaintext, method, gateway_tx_id, created_at, expires_at)
       select '${g.requestId}', '${plain.replace(/'/g, "''")}', 'fake', 'fake-tx-early2', x.canceled_at - interval '1 second', x.canceled_at - interval '1 second' + interval '5 minutes'
       from public.approval_cancellations x where x.order_id = '${g.orderId}' returning id`,
    ).split("\n")[0]!;
    const r = await adminClient().rpc("settle_approval_sign", settleArgs(early, creatorActorOf(g.requestId), plain));
    expect(r.data).not.toBe("approved");
    expect(approvalState(g)).toBe("waiting|false|registered");
    expect(signatureCount(g)).toBe(1);
  });

  it(`INV-AC2 AC2: 결제 + ${DEADLINE_HOURS + 2}시간에 취소 → 다시 승인은 기한 지남, 자동 처리가 반려한다. 승인 기한은 취소로 늘지 않는다`, async () => {
    const g = await paidGift(1);
    await approve(g);
    const deadlineBefore = (await targets(creatorActorOf(g.requestId)!)).find((t) => t.order_no === g.orderNo)?.approval_deadline_at;
    psql(`update public.orders set registered_at = now() - interval '${DEADLINE_HOURS + 2} hours' where id = '${g.orderId}'`);
    const registeredAt = psql(`select registered_at from public.orders where id = '${g.orderId}'`);
    expect(await cancel(g.requestId)).toEqual({ result: "canceled", phase: "before_inbound" });
    expect(psql(`select registered_at from public.orders where id = '${g.orderId}'`)).toBe(registeredAt);
    expect((await startSignRpc(g.requestId)).result).toBe("expired");
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).error).toBeNull();
    expect(approvalState(g)).toBe("expired|false|expired");
    expect(deadlineBefore).toBeTruthy();
  });

  it("INV-AC2: 기한 안의 취소 뒤에도 화면이 받는 승인 기한은 결제 완료 + 기한 그대로", async () => {
    const g = await paidGift(1);
    await approve(g);
    const actor = creatorActorOf(g.requestId)!;
    const before = (await targets(actor)).find((t) => t.order_no === g.orderNo)!;
    const expected = psql(`select to_char((registered_at + interval '${DEADLINE_HOURS} hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') from public.orders where id = '${g.orderId}'`);
    expect(new Date(before.approval_deadline_at).toISOString().slice(0, 19)).toBe(expected);
    await cancel(g.requestId);
    await approve(g);
    const after = (await targets(actor)).find((t) => t.order_no === g.orderNo)!;
    expect(after.approval_deadline_at).toBe(before.approval_deadline_at);
  });
});

describe("INV-AC3: 송장 출력은 무효가 아닌 가장 최근 승인의 서명만 다시 본다", () => {
  it("INV-AC3 AC3: 입고 전 취소된 주문의 상자가 도착·검수된 뒤 송장 출력 → 거부, 거부 기록 한 줄, 상자 그대로", async () => {
    const g = await paidGift(1, ADDRESS_CREATOR_ID);
    await approve(g);
    expect(await cancel(g.requestId)).toEqual({ result: "canceled", phase: "before_inbound" });
    const qr = await arrive(g.boxIds[0]!);
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS)).toBe("inspected");
    expect(await print(qr)).toEqual({ kind: "denied", reason: "no_valid_approval" });
    expect(logRows(g.orderId)).toEqual([`denied:no_valid_approval:${OWNER_ID}`]);
    expect(parcelState(qr)).toBe("inspected");
  });

  it("INV-AC3: 취소 뒤 다시 승인하면 새 서명으로 송장이 나온다(취소한 서명과 새 서명이 함께 있어도)", async () => {
    const g = await paidGift(1, ADDRESS_CREATOR_ID);
    await approve(g);
    await cancel(g.requestId);
    await approve(g);
    const qr = await arrive(g.boxIds[0]!);
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS)).toBe("inspected");
    expect(await print(qr)).toMatchObject({ kind: "printed", reprint: false });
  });
});

describe("INV-AC4: 취소할 수 있는 때는 첫 송장 출력 전까지", () => {
  it("INV-AC4 AC4: 송장이 출력된 상자가 있는 주문의 취소 → 거부, 상태 그대로. 화면 값도 「취소 불가」", async () => {
    const g = await paidGift(1, ADDRESS_CREATOR_ID);
    await approve(g);
    const qr = await arrive(g.boxIds[0]!);
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS)).toBe("inspected");
    expect(await print(qr)).toMatchObject({ kind: "printed" });
    const before = approvalState(g);
    expect(await cancel(g.requestId)).toEqual({ result: "printed", phase: null });
    expect(approvalState(g)).toBe(before);
    expect(cancellations(g)).toEqual([]);
    expect((await targets(creatorActorOf(g.requestId)!)).find((t) => t.order_no === g.orderNo)).toMatchObject({ cancelable: false, arrived_box_count: 1 });
  });
});

describe("INV-AC4: 송장 출력 조건만으로 막히는 경우 — 송장 출력이 진행 중(주소를 열고 아직 송장이 나오지 않음)이고 주문은 검수 단계", () => {
  /** 승인·도착·검수까지 끝난 상자 하나에, 송장 출력 함수가 주소를 연 순간의 기록(연 줄)을 남긴 주문 — 송장이 나오기 전이라 주문·상자 단계는 그대로 검수 */
  async function openedNotPrinted(): Promise<Unit> {
    const g = await paidGift(1);
    await approve(g);
    const qr = await arrive(g.boxIds[0]!);
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS)).toBe("inspected");
    // 준비 한 줄(DB 소유자로)
    psql(`insert into public.decrypt_log (order_id, box_id, requester_id, result, print_no) values ('${g.orderId}', '${g.boxIds[0]}', '${OWNER_ID}', 'opened', 1)`);
    expect(psql(`select status || '|' || (shipped_at is null)::text from public.orders where id = '${g.orderId}'`)).toBe("inspected|true");
    expect(parcelState(qr)).toBe("inspected");
    return g;
  }

  it("INV-AC4 AC4 (취소 함수): 취소 거부(printed), 상태·기록 그대로", async () => {
    const g = await openedNotPrinted();
    const before = approvalState(g);
    expect(await cancel(g.requestId)).toEqual({ result: "printed", phase: null });
    expect(approvalState(g)).toBe(before);
    expect(cancellations(g)).toEqual([]);
  });

  it("INV-AC4 AC4 (화면 값): 취소 불가로 준다 — 취소 함수와 같은 판정", async () => {
    const g = await openedNotPrinted();
    expect((await targets(creatorActorOf(g.requestId)!)).find((t) => t.order_no === g.orderNo)).toMatchObject({ cancelable: false, arrived_box_count: 1 });
  });
});

describe("INV-AC5: 크리에이터 본인만, 취소와 승인이 동시에 와도 상태는 하나", () => {
  it("INV-AC5 AC5 (실패경로): 다른 크리에이터·팬·사람 없음의 취소는 없는 요청과 같은 답 — 상태·기록 그대로", async () => {
    const g = await paidGift(1);
    await approve(g);
    for (const actor of [MOMO_PROFILE_ID, SEED.fanId, null]) {
      expect(await cancel(g.requestId, actor)).toEqual({ result: "not_found", phase: null });
    }
    expect(approvalState(g)).toBe("approved|true|registered");
    expect(cancellations(g)).toEqual([]);
    // 다른 크리에이터의 화면 값에도 나오지 않는다
    expect((await targets(MOMO_PROFILE_ID)).some((t) => t.order_no === g.orderNo)).toBe(false);
  });

  it("INV-AC5 AC5: 취소 함수는 앱 서버 키 전용 — 로그인한 크리에이터 토큰으로 직접 부르면 거부", async () => {
    const g = await paidGift(1);
    await approve(g);
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("cancel_approval", { p_actor_id: SEED.creatorProfileId, p_request_id: g.requestId })).error).not.toBeNull();
    expect((await haru.rpc("my_approval_cancel_targets", { p_actor_id: SEED.creatorProfileId })).error).not.toBeNull();
    expect(approvalState(g)).toBe("approved|true|registered");
  });

  it("INV-AC5 AC5 (동시): 취소와 승인 서명 결과가 동시에 와도 상태는 하나 — 승인 표시·주문 승인 시각·살아 있는 서명이 서로 맞는다", async () => {
    const g = await paidGift(1);
    await approve(g);
    await cancel(g.requestId);
    const actor = creatorActorOf(g.requestId);
    const started = await startSignRpc(g.requestId, actor);
    await recordSignTx(started.sign_request_id!, actor);
    // 승인 요청 줄을 잡아 두 요청을 확실히 겹치게 한다
    const lock = await holdRowLock(`select 1 from public.approval_requests where request_id = '${g.requestId}' for update`, 1);
    const [settled, canceled] = await Promise.all([
      adminClient().rpc("settle_approval_sign", settleArgs(started.sign_request_id!, actor, started.plaintext!)),
      cancel(g.requestId),
    ]);
    await lock.released;
    expect(settled.data).toBe("approved");
    const state = approvalState(g);
    const live = Number(
      psql(
        `select count(*) from public.approval_signatures s where s.request_id = '${g.requestId}' and not exists (select 1 from public.approval_cancellations x where x.signature_id = s.id)`,
      ),
    );
    if (canceled.result === "canceled") {
      // 승인이 먼저 — 취소가 나중이라 대기
      expect(state).toBe("waiting|false|registered");
      expect(live).toBe(0);
    } else {
      // 취소가 먼저(아직 승인 전이라 취소할 것이 없음) — 승인이 나중이라 승인됨
      expect(canceled.result).toBe("not_approved");
      expect(state).toBe("approved|true|registered");
      expect(live).toBe(1);
    }
  });

  it("INV-AC5: 취소 기록의 계정은 자동 삭제가 주문을 「같이 쓰는 크리에이터」로 바꿀 때 같이 쓰는 표시로 바뀐다(카드 d123) — 다른 크리에이터로 바뀔 때는 그대로", async () => {
    const g = await paidGift(1);
    await approve(g);
    await cancel(g.requestId);
    const by = () => psql(`select canceled_by from public.approval_cancellations where order_id = '${g.orderId}'`);
    psql(`update public.orders set creator_id = '00000000-0000-4000-b000-000000000002' where id = '${g.orderId}'`);
    expect(by()).toBe(SEED.creatorProfileId);
    psql(`update public.orders set creator_id = 'ffffffff-0000-4000-8000-000000000002' where id = '${g.orderId}'`);
    expect(by()).toBe("ffffffff-0000-4000-8000-000000000001");
  });

  it("INV-AC5 (동시): 같은 취소가 두 번 동시에 와도 취소 기록은 하나", async () => {
    const g = await paidGift(1);
    await approve(g);
    const lock = await holdRowLock(`select 1 from public.approval_requests where request_id = '${g.requestId}' for update`, 1);
    const results = await Promise.all([cancel(g.requestId), cancel(g.requestId)]);
    await lock.released;
    expect(results.map((r) => r.result).sort()).toEqual(["canceled", "not_approved"]);
    expect(cancellations(g)).toHaveLength(1);
  });
});

/** 다른 연결에서 SQL 을 돌린다(끝나기를 기다리지 않고 시작) — 끝나면 오류 메시지(성공이면 null) */
function psqlAsync(sql: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("exit", (code) => resolve(code === 0 ? null : err));
  });
}

describe("INV-S5·INV-AC2: 승인 요청 하나에 살아 있는(취소되지 않은) 서명은 하나 — 동시에 와도", () => {
  it("INV-S5 (동시): 같은 승인 요청에 서명 기록 두 건이 동시에 들어와도 하나만 남고 하나는 거부된다(승인 함수를 거치지 않은 삽입도)", async () => {
    const g = await paidGift(1);
    // 서명 요청 두 줄(끝난 상태) — 서명 기록이 가리킬 자리
    const signIds = [0, 1].map(() =>
      psql(
        `insert into public.approval_sign_requests (approval_request_id, plaintext, method, state, created_at, expires_at, finished_at) values ('${g.requestId}', null, 'fake', 'failed', now(), now() + interval '5 minutes', now()) returning id`,
      ).split(/\r?\n/)[0]!,
    );
    const insert = (signId: string) =>
      `insert into public.approval_signatures (request_id, signed_content, signer_id, content_hash, signature, method, signed_at, sign_request_id) values ('${g.requestId}', null, null, '${"a".repeat(64)}', 'fake-signature', 'fake', now(), '${signId}')`;
    // 승인 요청 줄을 잡아 두 삽입을 확실히 겹치게 한다
    const lock = await holdRowLock(`select 1 from public.approval_requests where request_id = '${g.requestId}' for update`, 1);
    const errors = await Promise.all(signIds.map((id) => psqlAsync(insert(id))));
    await lock.released;
    expect(errors.filter((e) => e === null)).toHaveLength(1);
    expect(errors.find((e) => e !== null)).toMatch(/살아 있는 서명/);
    expect(signatureCount(g)).toBe(1);
  });
});

describe("INV-AC6: 승인이 한 번이라도 있었던 주문은 팬에게 받는 주소를 계속 보인다", () => {
  it("INV-AC6 AC6: 승인 → 입고 전 취소(대기) 뒤에도 팬의 상자 화면에 받는 주소(6자리)가 그대로, 「먼저 보내기」를 다시 요구하지 않는다", async () => {
    const g = await paidGift(1);
    const fan = await signedInClient("byeolbit_fan");
    const boxes = async () => (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data as { address_code: string | null; send_ack_needed: boolean }[];
    // 승인 전(먼저 보내기 전)에는 가려져 있다 — 비교 기준
    expect((await boxes())[0]).toMatchObject({ address_code: null, send_ack_needed: true });
    await approve(g);
    const shown = (await boxes())[0]!.address_code;
    expect(shown).toMatch(/^[0-9A-Z]{6}$/);
    await cancel(g.requestId);
    expect((await boxes())[0]).toMatchObject({ address_code: shown, send_ack_needed: false });
    // 팬 선물 읽기도 「주소를 본 적 있음」 — 「먼저 보내기」 안내를 다시 띄우지 않는다. 「먼저 보내기」 칸은 팬이 누른 기록이라 비어 있는 그대로다(INV-S9)
    const gifts = (await fan.rpc("my_gifts")).data as { order_no: string; approved_at: string | null; fan_send_ack_at: string | null; send_guide_shown: boolean }[];
    expect(gifts.find((x) => x.order_no === g.orderNo)).toMatchObject({ approved_at: null, fan_send_ack_at: null, send_guide_shown: true });
    expect(psql(`select fan_send_ack_at is null from public.orders where id = '${g.orderId}'`)).toBe("t");
  });

  it("INV-AC6: 승인 이력이 있는 주문은 대기로 돌아간 뒤 거절돼도 「받는 주소를 본 주문」으로 환불한다(전액이 아니라 상자 금액 − 배송비 칸)", async () => {
    const g = await paidGift(1);
    await approve(g);
    await cancel(g.requestId);
    const haru = await signedInClient("haru_creator");
    expect(((await haru.rpc("decline_gift", { p_request_id: g.requestId, p_block: false })).data as { result: string }).result).toBe("declined");
    expect(refundDue(g.orderId)).toBe(priceMinusShipping(g.orderId));
  });
});
