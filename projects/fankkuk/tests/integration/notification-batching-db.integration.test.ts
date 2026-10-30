import { afterEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, holdRowLock, payTestOrder, psql, registerTestOrder, SEED, signedInClient } from "./helpers";
import { approve, fanSetsWaybill, paidGift, receiveAndLabel, waybill, type Unit } from "./office-helpers";
import { giftBoxes } from "./gift-reply-helpers";

// 알림 묶어 보내기 — DB 층 (docs/specs/notification-batching.md INV-NB1·NB2·NB5, 본문 칸은 INV-NB3·NB4).
// 시각이 걸린 시험은 기다리지 않고 DB 의 시각 칸(창의 시작·끝, 결제 완료 시각)을 직접 옮겨 「그만큼 시간이 흐른 상태」를 만든다.
// 승인 요청 창 시험은 시드 대기 요청이 없는 모모에게 보낸다 — 건수가 시험이 만든 요청만큼이어야 한다.
// 연락처 칸 시험(S5e)은 연락처 함수(manual/0011·0016 — 사람이 적용)가 있어야 통과한다.

const OUTBOX = "public.notification_outbox";
const WINDOWS = "public.approval_notice_windows";
const PREFS = "public.notification_preferences";
const ITEMS = "public.notification_digest_items";
const MOMO = { creatorId: "00000000-0000-4000-b000-000000000002", accountId: "00000000-0000-4000-a000-000000000012" };
const BYEOLBIT = SEED.fanId;

afterEach(() => {
  deleteTestOrders();
  // 창·설정·묶음 대기·발송 줄은 로컬 DB 에서 통째로 비운다(시드에는 없다)
  psql(`delete from ${OUTBOX}; delete from ${WINDOWS}; delete from ${PREFS}; delete from ${ITEMS}; delete from public.notification_kakao_templates;`);
});

/** 모모에게 결제까지 끝난 선물 하나 */
const paidToMomo = () => paidGift(1, MOMO.creatorId, { keepApprovalWindow: true });

/** 그 승인 요청을 가리키는 발송 줄 「종류|차례|통로」 */
function requestRows(unit: Unit): string[] {
  const out = psql(
    `select o.kind || '|' || o.round || '|' || o.channel from ${OUTBOX} o join public.approval_requests r on r.id = o.approval_request_id where r.request_id = '${unit.requestId}' order by o.kind, o.round, o.channel`,
  );
  return out === "" ? [] : out.split("\n");
}

/** 모모 계정의 승인 요청(첫 통·끝 통) 줄 수 */
const momoApprovalRows = () => Number(psql(`select count(*) from ${OUTBOX} where account_id = '${MOMO.accountId}' and kind = 'approval_request' and channel = 'email'`));

/** 창이 열린 지 그만큼 지난 것으로 — 창의 시작·끝을 같이 당긴다 */
function windowAgo(interval: string): void {
  psql(`update ${WINDOWS} set opened_at = opened_at - interval '${interval}', ends_at = ends_at - interval '${interval}' where account_id = '${MOMO.accountId}'`);
}

function queued(): string {
  return psql(`select coalesce((select r.request_id from ${WINDOWS} w join public.approval_requests r on r.id = w.queued_request_id where w.account_id = '${MOMO.accountId}'), '-')`);
}

async function closeWindows(): Promise<number> {
  const r = await adminClient().rpc("notification_close_windows");
  if (r.error) throw new Error(`notification_close_windows 실패: ${r.error.code} ${r.error.message}`);
  return r.data as number;
}

async function enqueueDue(): Promise<void> {
  const r = await adminClient().rpc("notification_enqueue_due");
  if (r.error) throw new Error(`notification_enqueue_due 실패: ${r.error.code} ${r.error.message}`);
}

type Claimed = {
  id: string;
  kind: string;
  round: number;
  order_no: string | null;
  nickname: string;
  waiting_count: number | null;
  days_left: number | null;
  item_count: number | null;
  recipient_is_creator: boolean;
  must_deliver: boolean;
};

/** 이 줄만 꺼낼 차례로 두고 꺼낸다. 건너뜀으로 끝나면 빈 배열 */
async function claimOnly(id: string): Promise<Claimed[]> {
  psql(`update ${OUTBOX} set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`);
  const r = await adminClient().rpc("notification_claim", { p_limit: 5 });
  if (r.error) throw new Error(`notification_claim 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Claimed[];
}

function rowIdOf(unit: Unit, kind: string, round: number, channel = "email"): string {
  const id = psql(
    `select o.id from ${OUTBOX} o join public.approval_requests r on r.id = o.approval_request_id where r.request_id = '${unit.requestId}' and o.kind = '${kind}' and o.round = ${round} and o.channel = '${channel}'`,
  );
  if (!id) throw new Error(`발송 줄이 없다: ${unit.requestId} ${kind} ${round}`);
  return id;
}

const rowStatus = (id: string) => psql(`select status || '|' || coalesce(error_code, '-') from ${OUTBOX} where id = '${id}'`);

// ── INV-NB1 승인 요청 10분 창 ──────────────────────────────────

describe("승인 요청 10분 창 (INV-NB1)", () => {
  it("INV-NB1 (S1): 0분·3분·6분 결제 셋 — 0분에 바로 한 통(대기 1건), 3분·6분은 쌓기만, 창이 끝나면 한 통 더(대기 3건)", async () => {
    const a = await paidToMomo();
    expect(requestRows(a)).toEqual(["approval_request|1|email"]);
    const first = await claimOnly(rowIdOf(a, "approval_request", 1));
    expect(first.map((c) => [c.kind, c.waiting_count, c.order_no])).toEqual([["approval_request", 1, null]]);

    windowAgo("3 minutes");
    const b = await paidToMomo();
    expect(requestRows(b)).toEqual([]);
    expect(queued()).toBe(b.requestId);
    windowAgo("3 minutes");
    const c = await paidToMomo();
    expect(requestRows(c)).toEqual([]);
    expect(queued()).toBe(c.requestId);
    expect(momoApprovalRows()).toBe(1);

    // 6분 — 창이 아직 열려 있어 끝 통이 없다
    expect(await closeWindows()).toBe(0);
    expect(momoApprovalRows()).toBe(1);

    // 10분 — 끝 통 하나, 쌓임 표시는 비워진다
    windowAgo("4 minutes");
    expect(await closeWindows()).toBe(1);
    expect(requestRows(c)).toEqual(["approval_request|2|email"]);
    expect(queued()).toBe("-");
    expect(await closeWindows()).toBe(0);
    const last = await claimOnly(rowIdOf(c, "approval_request", 2));
    expect(last.map((x) => [x.kind, x.round, x.waiting_count])).toEqual([["approval_request", 2, 3]]);
    expect(momoApprovalRows()).toBe(2);
  });

  it("INV-NB1 (S1b): 결제 하나뿐인 창은 끝나도 더 보내지 않고, 12분에 온 결제는 새 창을 열어 바로 한 통(대기 2건)", async () => {
    const a = await paidToMomo();
    windowAgo("10 minutes");
    expect(await closeWindows()).toBe(0);
    expect(momoApprovalRows()).toBe(1);
    windowAgo("2 minutes");
    const b = await paidToMomo();
    expect(requestRows(a)).toEqual(["approval_request|1|email"]);
    expect(requestRows(b)).toEqual(["approval_request|1|email"]);
    expect(psql(`select (ends_at > now() and ends_at <= now() + interval '10 minutes')::text from ${WINDOWS} where account_id = '${MOMO.accountId}'`)).toBe("true");
    const claimed = await claimOnly(rowIdOf(b, "approval_request", 1));
    expect(claimed.map((x) => x.waiting_count)).toEqual([2]);
  });

  it("INV-NB1 · action-center INV-J5 (실패경로): 승인 대기 건수는 처리할 일 목록과 같은 판정 — 결제 뒤 168시간이 지난 요청은 자동 반려가 아직 안 돌아 대기여도 세지 않는다", async () => {
    const a = await paidToMomo();
    windowAgo("10 minutes");
    psql(`update public.orders set registered_at = registered_at - interval '168 hours' where id = '${a.orderId}'`);
    const b = await paidToMomo();
    const claimed = await claimOnly(rowIdOf(b, "approval_request", 1));
    expect(claimed.map((x) => x.waiting_count)).toEqual([1]);
  });

  it("INV-NB1 (S1c, 동시): 결제 둘이 동시에 끝나도 열린 창은 하나, 바로 가는 통도 하나 — 다른 하나는 쌓여 창 끝에 간다", async () => {
    const o1 = await registerTestOrder(1, { creatorId: MOMO.creatorId });
    const o2 = await registerTestOrder(1, { creatorId: MOMO.creatorId });
    // 끝난 창 줄을 깔고 다른 연결이 쥐고 있게 해 두 결제가 같은 줄 앞에서 확실히 겹치게 한다
    psql(`insert into ${WINDOWS} (account_id, opened_at, ends_at) values ('${MOMO.accountId}', now() - interval '1 hour', now() - interval '50 minutes')`);
    const hold = await holdRowLock(`select 1 from ${WINDOWS} where account_id = '${MOMO.accountId}' for update`, 1.5);
    const [r1, r2] = await Promise.all([payTestOrder(o1, { keepApprovalWindow: true }), payTestOrder(o2, { keepApprovalWindow: true })]);
    await hold.released;
    expect(psql(`select count(*) from ${WINDOWS} where account_id = '${MOMO.accountId}' and ends_at > now()`)).toBe("1");
    expect(momoApprovalRows()).toBe(1);
    const opener = psql(`select r.request_id from ${OUTBOX} o join public.approval_requests r on r.id = o.approval_request_id where o.account_id = '${MOMO.accountId}' and o.channel = 'email'`);
    expect([r1, r2]).toContain(opener);
    expect(queued()).toBe(opener === r1 ? r2 : r1);
    windowAgo("10 minutes");
    expect(await closeWindows()).toBe(1);
    expect(momoApprovalRows()).toBe(2);
  });

  it("INV-NB1 (S1d, 실패경로): 0분·3분 결제를 9분에 둘 다 처리 — 10분 끝 통은 만들어지지만 보내는 순간 대기 0건이라 건너뜀", async () => {
    const a = await paidToMomo();
    windowAgo("3 minutes");
    const b = await paidToMomo();
    windowAgo("6 minutes");
    await approve(a);
    await approve(b);
    windowAgo("1 minute");
    expect(await closeWindows()).toBe(1);
    const id = rowIdOf(b, "approval_request", 2);
    expect(await claimOnly(id)).toEqual([]);
    expect(rowStatus(id)).toBe("skipped|no_waiting_requests");
  });

  it("INV-NB1 (실패경로): 첫 통도 보내는 순간 대기가 0건이면 건너뜀 — 그 사이 승인된 요청 때문에 「승인 대기 0건」이 가지 않는다", async () => {
    const a = await paidToMomo();
    await approve(a);
    const id = rowIdOf(a, "approval_request", 1);
    expect(await claimOnly(id)).toEqual([]);
    expect(rowStatus(id)).toBe("skipped|no_waiting_requests");
  });

  it("INV-NB1 · INV-NB3: 꺼낸 승인 요청 줄에는 주문번호가 없고, 승인 대기 건수와 꼭 가는 알림 표시가 있다", async () => {
    const a = await paidToMomo();
    const [c] = await claimOnly(rowIdOf(a, "approval_request", 1));
    expect(c).toMatchObject({ kind: "approval_request", order_no: null, waiting_count: 1, days_left: null, item_count: null, must_deliver: true, recipient_is_creator: true, nickname: "모모" });
    expect(Object.keys(c!)).not.toContain("auto_reject_at");
  });

  it("INV-NB1: 창 끝 통은 자동 처리(office_run_scheduled)에서도 만들어진다", async () => {
    await paidToMomo();
    windowAgo("2 minutes");
    await paidToMomo();
    windowAgo("10 minutes");
    psql("select public.office_run_scheduled()");
    expect(momoApprovalRows()).toBe(2);
  });

  it("INV-NB1 (실패경로): 창 열기·끝 통 함수는 앱 서버 키 전용 — 로그인 사용자·익명은 거부, 창 표는 화면 쪽 키로 읽지 못한다", async () => {
    const momo = await signedInClient("momo_creator");
    expect((await momo.rpc("notification_close_windows")).error?.code).toBe("42501");
    expect((await anonClient().rpc("notification_close_windows")).error?.code).toBe("42501");
    expect((await momo.from("approval_notice_windows").select("account_id")).error?.code).toBe("42501");
  });
});

// ── INV-NB2 승인 재알림 ────────────────────────────────────────

describe("승인 재알림 3일째·6일째 (INV-NB2)", () => {
  /** 결제 완료 뒤 그만큼 흐른 것으로 — 그 주문의 결제 완료 시각과 모모의 창을 같이 당긴다 */
  function age(unit: Unit, hoursAgo: string): void {
    psql(`update public.orders set registered_at = now() - interval '${hoursAgo}' where id = '${unit.orderId}'`);
    psql(`update ${WINDOWS} set opened_at = now() - interval '${hoursAgo}', ends_at = now() - interval '${hoursAgo}' + interval '10 minutes' where account_id = '${MOMO.accountId}'`);
  }
  const reminders = (unit: Unit) => requestRows(unit).filter((r) => r.startsWith("approval_reminder|"));

  it("INV-NB2 · INV-N8 (S2): 결제 완료 + 72시간 대기 → 재알림 1차 줄 하나, 두 번 돌려도 하나 — 144시간에 2차 하나", async () => {
    const a = await paidToMomo();
    age(a, "72 hours 1 minute");
    await enqueueDue();
    expect(reminders(a)).toEqual(["approval_reminder|1|email"]);
    await enqueueDue();
    expect(reminders(a)).toEqual(["approval_reminder|1|email"]);
    age(a, "144 hours 1 minute");
    await enqueueDue();
    await enqueueDue();
    expect(reminders(a)).toEqual(["approval_reminder|1|email", "approval_reminder|2|email"]);
  });

  it("INV-NB2 (S2b, 실패경로): 71시간 59분이면 재알림이 없고, 첫 상자가 입고돼도 승인 요청·재알림 줄이 더 생기지 않는다", async () => {
    const a = await paidToMomo();
    age(a, "71 hours 59 minutes");
    await enqueueDue();
    expect(reminders(a)).toEqual([]);
    const staff = await signedInClient("fankkuk_staff");
    const no = waybill();
    await fanSetsWaybill(a.boxIds[0]!, no);
    await receiveAndLabel(staff, no);
    expect(psql(`select received_at is not null from public.orders where id = '${a.orderId}'`)).toBe("t");
    expect(requestRows(a)).toEqual(["approval_request|1|email"]);
  });

  it("INV-NB2 (S2c): 대기 셋 중 하나가 자동 반려까지 20시간 — 재알림은 「승인 대기 3건」·1일", async () => {
    const urgent = await paidToMomo();
    const b = await paidToMomo();
    const c = await paidToMomo();
    psql(`update public.orders set registered_at = now() - interval '148 hours' where id = '${urgent.orderId}'`);
    psql(`update public.orders set registered_at = now() - interval '100 hours' where id = '${c.orderId}'`);
    age(b, "72 hours 1 minute");
    await enqueueDue();
    const [claimed] = await claimOnly(rowIdOf(b, "approval_reminder", 1));
    expect([claimed!.kind, claimed!.waiting_count, claimed!.days_left, claimed!.order_no, claimed!.must_deliver]).toEqual(["approval_reminder", 3, 1, null, true]);
  });

  it("INV-NB2: 남은 일수는 하루 단위로 올린다 — 반려까지 95시간 59분이면 4일", async () => {
    const a = await paidToMomo();
    age(a, "72 hours 1 minute");
    await enqueueDue();
    const [claimed] = await claimOnly(rowIdOf(a, "approval_reminder", 1));
    expect(claimed!.days_left).toBe(4);
  });

  it("INV-NB2 (S2d): 5분 전에 새 요청으로 창이 열렸으면 72시간이 된 다른 대기 건의 재알림은 만들지 않는다 — 창이 끝난 뒤에도 다시 생기지 않는다", async () => {
    const old = await paidToMomo();
    age(old, "72 hours 1 minute");
    await paidToMomo();
    windowAgo("5 minutes");
    await enqueueDue();
    expect(reminders(old)).toEqual([]);
    // 20분이 흐른다 — 결제 완료 시각과 창을 같이 당긴다
    psql(`update public.orders set registered_at = registered_at - interval '20 minutes' where creator_id = '${MOMO.creatorId}' and item_kind = '시험 선물'`);
    windowAgo("20 minutes");
    await enqueueDue();
    expect(reminders(old)).toEqual([]);
  });

  it("INV-NB2 (S2d): 창이 없으면 재알림은 바로 만들어지고 창을 열지 않는다", async () => {
    const a = await paidToMomo();
    age(a, "72 hours 1 minute");
    const before = psql(`select ends_at from ${WINDOWS} where account_id = '${MOMO.accountId}'`);
    await enqueueDue();
    expect(reminders(a)).toEqual(["approval_reminder|1|email"]);
    expect(psql(`select ends_at from ${WINDOWS} where account_id = '${MOMO.accountId}'`)).toBe(before);
    expect(psql(`select (ends_at <= now())::text from ${WINDOWS} where account_id = '${MOMO.accountId}'`)).toBe("true");
  });

  it("INV-NB2 (실패경로): 재알림 줄이 생긴 뒤 새 결제로 창이 열리면 꺼낼 때 건너뜀", async () => {
    const a = await paidToMomo();
    age(a, "72 hours 1 minute");
    await enqueueDue();
    const id = rowIdOf(a, "approval_reminder", 1);
    await paidToMomo();
    expect(await claimOnly(id)).toEqual([]);
    expect(rowStatus(id)).toBe("skipped|approval_window_open");
  });

  it("INV-NB2 (실패경로): 재알림 줄이 대기인 사이에 승인 → 꺼낼 때 건너뜀", async () => {
    const a = await paidToMomo();
    age(a, "72 hours 1 minute");
    await enqueueDue();
    const id = rowIdOf(a, "approval_reminder", 1);
    await approve(a);
    expect(await claimOnly(id)).toEqual([]);
    expect(rowStatus(id)).toBe("skipped|request_not_waiting");
  });

  it("INV-NB2 (실패경로): 이미 승인된 요청에는 72시간이 지나도 재알림이 없다", async () => {
    const a = await paidToMomo();
    await approve(a);
    age(a, "73 hours");
    await enqueueDue();
    expect(reminders(a)).toEqual([]);
  });

  it("INV-NB2 (실패경로): 6일째가 이미 지난 요청에 3일째 재알림을 뒤늦게 만들지 않는다", async () => {
    const a = await paidToMomo();
    age(a, "150 hours");
    await enqueueDue();
    expect(reminders(a)).toEqual(["approval_reminder|2|email"]);
  });
});

// ── INV-NB5 하루 묶음 ──────────────────────────────────────────

describe("하루 묶음과 바로 받기 (INV-NB5)", () => {
  /** 별빛에게 간 출고 사건·답장 사건을 그 사건 처리가 부르는 줄 넣기 함수로 */
  function shippedEvent(orderId: string): void {
    psql(`select public.notification_enqueue('shipped', '${orderId}', null, 1::smallint, '${BYEOLBIT}', now())`);
  }
  function replyEvent(orderId: string, parcelId: string): void {
    psql(`select public.gift_reply_enqueue('gift_reply', '${orderId}', '${parcelId}', '${BYEOLBIT}')`);
  }
  const statusRows = (account = BYEOLBIT) =>
    Number(psql(`select count(*) from ${OUTBOX} where account_id = '${account}' and kind in ('box_arrived', 'shipped', 'in_transit', 'delivered', 'gift_reply')`));
  const digestRows = (account = BYEOLBIT) =>
    psql(`select coalesce(string_agg(channel || '|' || item_count || '|' || digest_date, ',' order by digest_date, channel), '') from ${OUTBOX} where account_id = '${account}' and kind = 'status_digest'`);
  const openItems = (account = BYEOLBIT) => Number(psql(`select count(*) from ${ITEMS} where account_id = '${account}' and digested_at is null`));
  const seoulToday = () => psql(`select (now() at time zone 'Asia/Seoul')::date`);

  async function digest(): Promise<number> {
    const r = await adminClient().rpc("notification_enqueue_digest");
    if (r.error) throw new Error(`notification_enqueue_digest 실패: ${r.error.code} ${r.error.message}`);
    return r.data as number;
  }

  async function setInstant(login: string, on: boolean): Promise<void> {
    const r = await (await signedInClient(login)).rpc("set_notification_instant", { p_instant: on });
    if (r.error) throw new Error(`set_notification_instant 실패: ${r.error.code}`);
  }

  it("INV-NB5 (S5): 바로 받기 꺼짐(기본) — 출고 1·답장 1은 사건 알림 없이 묶음 대기, 오후 7시 처리에 묶음 한 통(건수 2)", async () => {
    const [box] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 1);
    shippedEvent(box!.orderId);
    replyEvent(box!.orderId, box!.parcelId);
    expect(statusRows()).toBe(0);
    expect(openItems()).toBe(2);
    expect(await digest()).toBe(1);
    expect(digestRows()).toBe(`email|2|${seoulToday()}`);
    expect(openItems()).toBe(0);
    const id = psql(`select id from ${OUTBOX} where account_id = '${BYEOLBIT}' and kind = 'status_digest'`);
    const [c] = await claimOnly(id);
    expect(c).toMatchObject({ kind: "status_digest", order_no: null, item_count: 2, nickname: "별빛", recipient_is_creator: false, must_deliver: false, waiting_count: null });
  });

  it("INV-NB5 (S5): 실제 입고 사건 — 바로 받기 꺼짐이면 상자 도착은 묶음 대기로, 사건 알림 줄은 없다", async () => {
    const g = await paidGift();
    const staff = await signedInClient("fankkuk_staff");
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    await receiveAndLabel(staff, no);
    expect(statusRows()).toBe(0);
    expect(psql(`select string_agg(kind, ',') from ${ITEMS} where order_id = '${g.orderId}'`)).toBe("box_arrived");
  });

  it("INV-NB5 (S5b): 바로 받기 켜짐 — 실제 입고 사건의 상자 도착 알림이 바로 줄로 생기고 묶음에 들어가지 않는다", async () => {
    await setInstant("byeolbit_fan", true);
    const g = await paidGift();
    const staff = await signedInClient("fankkuk_staff");
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    await receiveAndLabel(staff, no);
    expect(psql(`select string_agg(kind || '|' || channel, ',') from ${OUTBOX} where order_id = '${g.orderId}' and kind = 'box_arrived'`)).toBe("box_arrived|email");
    expect(openItems()).toBe(0);
    expect(await digest()).toBe(0);
    expect(digestRows()).toBe("");
  });

  it("INV-NB5 (S5b): 바로 받기 켜짐 — 출고 사건 알림이 바로 줄로 생긴다", async () => {
    await setInstant("byeolbit_fan", true);
    const [box] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 1);
    shippedEvent(box!.orderId);
    expect(psql(`select string_agg(kind || '|' || channel, ',') from ${OUTBOX} where order_id = '${box!.orderId}'`)).toBe("shipped|email");
    expect(openItems()).toBe(0);
  });

  it("INV-NB5 (S5c, 실패경로): 소식 0건이면 묶음 줄 없음 — 두 번 돌려도, 같은 날 새 소식이 와도 계정마다 묶음 줄은 하나", async () => {
    expect(await digest()).toBe(0);
    expect(digestRows()).toBe("");
    const [b1, b2] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 2);
    replyEvent(b1!.orderId, b1!.parcelId);
    expect(await digest()).toBe(1);
    expect(await digest()).toBe(0);
    expect(digestRows()).toBe(`email|1|${seoulToday()}`);
    // 같은 날 저녁 늦게 온 소식 — 오늘 묶음은 이미 있으니 묶지 않고 남겨 다음 묶음으로
    replyEvent(b2!.orderId, b2!.parcelId);
    expect(await digest()).toBe(0);
    expect(digestRows()).toBe(`email|1|${seoulToday()}`);
    expect(openItems()).toBe(1);
  });

  it("INV-NB5 (S5c): 다음 날에는 새 묶음 줄이 생긴다 — 줄의 이름에 날짜가 들어 있다", async () => {
    const [b1, b2] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 2);
    replyEvent(b1!.orderId, b1!.parcelId);
    expect(await digest()).toBe(1);
    // 어제 묶음이었던 것으로 — 지킴이를 끈 채 날짜 칸만 옮긴다(로컬 컨테이너)
    psql(`begin; set local session_replication_role = replica; update ${OUTBOX} set digest_date = digest_date - 1 where account_id = '${BYEOLBIT}' and kind = 'status_digest'; commit;`);
    replyEvent(b2!.orderId, b2!.parcelId);
    expect(await digest()).toBe(1);
    expect(digestRows().split(",")).toHaveLength(2);
    expect(digestRows().split(",")[1]).toBe(`email|1|${seoulToday()}`);
  });

  it("INV-NB5 (S5d, 실패경로): 바로 받기 꺼짐에 생긴 출고는 그 뒤 켜도 묶음으로 한 번만 — 같은 사건이 다시 와도 사건 알림 줄이 생기지 않는다", async () => {
    const [box] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 1);
    shippedEvent(box!.orderId);
    await setInstant("byeolbit_fan", true);
    shippedEvent(box!.orderId);
    expect(statusRows()).toBe(0);
    expect(await digest()).toBe(1);
    expect(digestRows()).toBe(`email|1|${seoulToday()}`);
  });

  it("INV-NB5 (S5d, 실패경로): 바로 받기 켜짐에 생긴 출고는 그 뒤 꺼도 사건 알림으로 한 번만 — 묶음 대기에 들어가지 않는다", async () => {
    await setInstant("byeolbit_fan", true);
    const [box] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 1);
    shippedEvent(box!.orderId);
    await setInstant("byeolbit_fan", false);
    shippedEvent(box!.orderId);
    expect(statusRows()).toBe(1);
    expect(openItems()).toBe(0);
    expect(await digest()).toBe(0);
  });

  it("INV-NB5 ④: 다섯 종류 밖의 알림(받았다고 확인됐어요)은 바로 받기 꺼짐이어도 묶지 않는다", async () => {
    const [box] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 1);
    psql(`select public.gift_reply_enqueue('gift_received', '${box!.orderId}', '${box!.parcelId}', '${BYEOLBIT}')`);
    expect(psql(`select count(*) from ${OUTBOX} where order_id = '${box!.orderId}' and kind = 'gift_received'`)).toBe("1");
    expect(openItems()).toBe(0);
  });

  it("INV-NB5 (S5e, manual/0011 뒤): 이메일 칸 꺼짐·카카오 칸 켜짐 — 묶음 줄은 두 통로 다 생기지만 연락처는 카카오만, 이메일은 빈 값(건너뜀)", async () => {
    psql(`insert into public.notification_kakao_templates (kind, template_code) values ('status_digest', 'TPL_DIGEST')`);
    const saved = psql(`select notify_email::text || '|' || notify_kakao::text from pii.account_contacts where account_id = '${BYEOLBIT}'`); // 'true|true' 꼴
    psql(`update pii.account_contacts set notify_email = false, notify_kakao = true where account_id = '${BYEOLBIT}'`);
    try {
      const [box] = giftBoxes(BYEOLBIT, SEED.haruCreatorId, 1);
      shippedEvent(box!.orderId);
      expect(await digest()).toBe(2);
      expect(digestRows()).toBe(`email|1|${seoulToday()},kakao|1|${seoulToday()}`);
      const ids = Object.fromEntries(
        psql(`select channel || '=' || id from ${OUTBOX} where account_id = '${BYEOLBIT}' and kind = 'status_digest'`).split("\n").map((l) => l.split("=") as [string, string]),
      );
      for (const ch of ["email", "kakao"]) expect((await claimOnly(ids[ch]!)).map((c) => c.id)).toEqual([ids[ch]]);
      const email = await adminClient().rpc("notification_contact", { p_outbox_id: ids.email });
      const kakao = await adminClient().rpc("notification_contact", { p_outbox_id: ids.kakao });
      expect([email.error, kakao.error]).toEqual([null, null]);
      expect(email.data).toBeNull();
      expect(typeof kakao.data === "string" && kakao.data.length > 0).toBe(true);
    } finally {
      const [mail, kakao] = saved.split("|");
      psql(`update pii.account_contacts set notify_email = ${mail === "true"}, notify_kakao = ${kakao === "true"} where account_id = '${BYEOLBIT}'`);
    }
  });

  it("INV-NB5: 바로 받기는 본인 함수로만 — 읽기·바꾸기는 로그인한 본인 줄만, 익명은 거부, 표는 화면 쪽 키로 직접 닿지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_notification_instant")).data).toBe(false);
    expect((await fan.rpc("set_notification_instant", { p_instant: true })).error).toBeNull();
    expect((await fan.rpc("my_notification_instant")).data).toBe(true);
    expect(psql(`select account_id || '|' || instant from ${PREFS}`)).toBe(`${BYEOLBIT}|true`);
    const other = await signedInClient("daltokki_fan");
    expect((await other.rpc("my_notification_instant")).data).toBe(false);
    expect((await anonClient().rpc("set_notification_instant", { p_instant: true })).error?.code).toBe("42501");
    expect((await fan.from("notification_preferences").select("instant")).error?.code).toBe("42501");
    expect((await fan.from("notification_preferences").insert({ account_id: SEED.otherFanId, instant: true })).error?.code).toBe("42501");
    expect((await fan.from("notification_digest_items").select("id")).error?.code).toBe("42501");
  });

  it("INV-NB5 (실패경로): 묶음 처리 함수는 앱 서버 키 전용 — 로그인 사용자·익명은 거부", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("notification_enqueue_digest")).error?.code).toBe("42501");
    expect((await anonClient().rpc("notification_enqueue_digest")).error?.code).toBe("42501");
  });

  it("INV-NB5 ②: 하루 묶음은 매일 서울 오후 7시(UTC 10시)에 돈다", () => {
    expect(psql(`select schedule || '|' || command from cron.job where jobname = 'fankkuk-digest'`)).toBe("0 10 * * *|select public.notification_enqueue_digest()");
  });
});
