import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { deleteTestOrders, psql, SEED, signedInClient } from "./helpers";
import { approve, codeOf, deleteTestUnmatched, FAN_PASS, fanSetsWaybill, inspect, paidGift, paidShare, receiveAndLabel, scanInbound, waybill, type Unit } from "./office-helpers";
import { labeled, measure, paidOrder } from "./difference-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 2026-10-21 기한 정리(DECISIONS 「기한 정리」) — 단계 넷, 시계 하나씩.
// ① 보내기(결제 완료): 끝난 주문의 살려 둔 상자·몫도 결제 + 720시간에 닫는다 (payment INV-M18 S18h·S18j, inbound-address-code INV-C3 S3e, office-workflow INV-W10 S10d·S10g, reverse-gift INV-R11 S11e)
//    도착하지 않은 상자 알림은 7·14·25일 세 차례 (INV-W10 S10e, notifications INV-N15 S15)
// ② 검수 결과(검수 완료 스캔): 차액 기한 시계 = 검수 완료 스캔 (payment INV-M13 S13), 차액·크리에이터 확인·추적기 신고에 72시간 재알림 (S13b, INV-W13 S13f, INV-W14 S14e, INV-N13 S13h, INV-N18 S18c)
// ③ 주인 없는 상자(도착): 보류 사유와 상관없이 도착 + 720시간 (inbound-address-code INV-C6 S6, INV-C9 S9c·S9e, office-workflow INV-W6 S6d)
// 시간은 시각 칸을 앞으로 옮겨 흉내 낸다.

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

const staff = (): Promise<SupabaseClient> => signedInClient("fankkuk_staff");

async function runExpiry(orderNo?: string): Promise<Record<string, number>> {
  const r = await (await staff()).rpc("office_run_expiry", orderNo ? { p_order_no: orderNo } : {});
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Record<string, number>;
}

/** 시각 칸을 트리거 없이 옮긴다(보호 트리거가 시각 변경을 막는 표가 있다) */
const shift = (sql: string) => psql(`begin; set local session_replication_role = replica; ${sql}; commit;`);
const backdatePaid = (orderId: string, hours: string) => shift(`update public.orders set registered_at = now() - interval '${hours}' where id = '${orderId}'`);
const backdateInspected = (qr: string, hours: string) => shift(`update public.office_parcels set inspected_at = now() - interval '${hours}' where qr_code = '${qr}'`);

const missing = (boxId: string) => psql(`select missing_at is not null from public.boxes where id = '${boxId}'`);
const codeState = (boxId: string) => psql(`select state from public.inbound_codes where box_id = '${boxId}'`);
const boxRefundDue = (boxId: string) => psql(`select coalesce(public.refund_due_of_box('${boxId}')::text, 'none')`);
const parcelState = (qr: string) => psql(`select state from public.office_parcels where qr_code = '${qr}'`);
const parcelIdOf = (qr: string) => psql(`select id from public.office_parcels where qr_code = '${qr}'`);
/** 그 주문의 알림 줄(이메일 통로)을 「종류|차례」로, 차례 순 */
const rounds = (orderId: string, kind: string, account?: string) =>
  psql(
    `select coalesce(string_agg(kind || '|' || round, ',' order by round), '') from public.notification_outbox where order_id = '${orderId}' and kind = '${kind}' and channel = 'email'${account ? ` and account_id = '${account}'` : ""}`,
  );

async function decline(g: Unit): Promise<void> {
  const r = await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false });
  if (r.error) throw new Error(`decline_gift 실패: ${r.error.code} ${r.error.message}`);
}

/** 6자리로 입고 + 라벨 부착 확인 + 검수 통과. 돌려주는 값은 내부 QR. */
async function arriveAndPass(boxId: string): Promise<string> {
  const op = await staff();
  const r = await scanInbound(op, waybill(), { code: codeOf({ boxId }) });
  expect(r.data).toMatchObject({ result: "received" });
  const qr = (r.data as { qr: string }).qr;
  expect((await op.rpc("office_confirm_label", { p_qr: qr })).error).toBeNull();
  expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
  return qr;
}

describe("① 끝난 주문의 살려 둔 상자 — 결제 완료 + 720시간 (payment INV-M18 · inbound-address-code INV-C3 · office-workflow INV-W10)", () => {
  it("INV-M18·C3·W10 (S18h·S3e·S10d): 결제 + 3일에 거절된 주문의 B 는 거절 + 168시간이 지나도, 결제 + 719시간에도 그대로 — 결제 + 720시간에 닫힘(두 번 돌려도 한 번)", async () => {
    const g = await paidGift(2);
    await arriveAndPass(g.boxIds[0]!);
    await decline(g);
    // 결제 + 3일에 거절한 것으로: 결제 시각은 지금 − 72시간, 살려 둔 시각은 지금 − 0
    backdatePaid(g.orderId, "72 hours");
    shift(`update public.inbound_codes set kept_at = now() - interval '200 hours' where box_id = '${g.boxIds[1]}'`); // 살려 둔 지 168시간이 넘음
    expect((await runExpiry(g.orderNo)).kept_closed).toBe(0);
    expect(codeState(g.boxIds[1]!)).toBe("valid");
    backdatePaid(g.orderId, "719 hours");
    expect((await runExpiry(g.orderNo)).kept_closed).toBe(0);
    expect(missing(g.boxIds[1]!)).toBe("f");
    backdatePaid(g.orderId, "720 hours");
    expect((await runExpiry(g.orderNo)).kept_closed).toBe(1);
    expect((await runExpiry(g.orderNo)).kept_closed).toBe(0);
    expect(missing(g.boxIds[1]!)).toBe("t");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    // 상자 환불 대상 = 남겨 둔 배송비 칸(S10g)
    expect(boxRefundDue(g.boxIds[1]!)).toBe(psql(`select shipping_fee_krw::text from public.boxes where id = '${g.boxIds[1]}'`));
  });

  it("INV-W10 (S10d): 결제 + 719시간에 도착한 B 는 그 주문 상자로 입고된다(살려 둔 6자리가 아직 유효)", async () => {
    const g = await paidGift(2);
    await arriveAndPass(g.boxIds[0]!);
    await decline(g);
    backdatePaid(g.orderId, "719 hours");
    await runExpiry(g.orderNo);
    const r = await scanInbound(await staff(), waybill(), { code: codeOf({ boxId: g.boxIds[1]! }) });
    expect(r.data).toMatchObject({ result: "received" });
  });

  it("INV-M18 (S18j): 결제 + 720시간이 이미 지난 주문이 끝나면 안 온 상자는 살려 두지 않고 같은 처리에서 닫힌다 — 상자 환불 대상은 배송비 칸", async () => {
    const g = await paidGift(2);
    await approve(g);
    await arriveAndPass(g.boxIds[0]!);
    backdatePaid(g.orderId, "721 hours");
    // 대표의 입고 뒤 취소로 끝낸다 — 자동 처리를 돌리지 않는다
    const r = await (await signedInClient("fankkuk_admin")).rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "시험" });
    if (r.error) throw new Error(`admin_cancel_received_gift 실패: ${r.error.code} ${r.error.message}`);
    expect(missing(g.boxIds[1]!)).toBe("t");
    expect(codeState(g.boxIds[1]!)).toBe("void");
    expect(boxRefundDue(g.boxIds[1]!)).toBe(psql(`select shipping_fee_krw::text from public.boxes where id = '${g.boxIds[1]}'`));
    // 이미 닫혔으니 「늦게 오면 돌려보내요」 안내(gift_pending_box)는 가지 않는다
    expect(rounds(g.orderId, "gift_pending_box")).toBe("");
  });

  it("INV-R11 (S11e·S10g): 받지 않음이 된 역조공 몫의 6자리는 몫 결제 + 719시간이면 유효(살려 둔 지 168시간이 넘어도), 720시간에 무효", async () => {
    const s = await paidShare();
    expect((await (await signedInClient("byeolbit_fan")).rpc("decline_revgift", { p_order_no: s.orderNo })).error).toBeNull();
    shift(`update public.inbound_codes set kept_at = now() - interval '200 hours' where share_id = '${s.shareId}'`);
    shift(`update public.revgift_sends set settled_at = now() - interval '719 hours' where id = '${s.sendId}'`);
    await runExpiry(s.orderNo);
    expect(psql(`select state from public.inbound_codes where share_id = '${s.shareId}'`)).toBe("valid");
    shift(`update public.revgift_sends set settled_at = now() - interval '720 hours' where id = '${s.sendId}'`);
    expect((await runExpiry(s.orderNo)).kept_closed).toBe(1);
    expect(psql(`select state from public.inbound_codes where share_id = '${s.shareId}'`)).toBe("void");
  });
});

describe("① 도착하지 않은 상자 알림 — 7·14·25일 (office-workflow INV-W10 S10e · notifications INV-N15 S15)", () => {
  it("INV-W10·N15 (S10e·S15): 결제 + 167시간이면 없음, 168·336·600시간에 때마다 한 줄(두 번 돌려도), 이름이 다른 줄 셋", async () => {
    const g = await paidGift(2);
    await approve(g);
    await arriveAndPass(g.boxIds[0]!);
    backdatePaid(g.orderId, "167 hours");
    await runExpiry(g.orderNo);
    expect(rounds(g.orderId, "box_missing")).toBe("");
    for (const [hours, want] of [
      ["168 hours", "box_missing|1"],
      ["336 hours", "box_missing|1,box_missing|2"],
      ["600 hours", "box_missing|1,box_missing|2,box_missing|3"],
    ] as const) {
      backdatePaid(g.orderId, hours);
      await runExpiry(g.orderNo);
      await runExpiry(g.orderNo);
      expect(rounds(g.orderId, "box_missing", SEED.fanId)).toBe(want);
    }
  });

  it("INV-W10 (S10e, 실패경로): 7일 전에 상자가 다 입고된 주문에는 줄이 없다 · 처음 돌린 때가 400시간이면 지금 차례(14일) 하나만", async () => {
    const done = await paidGift(1);
    await approve(done);
    await arriveAndPass(done.boxIds[0]!);
    backdatePaid(done.orderId, "600 hours");
    await runExpiry(done.orderNo);
    expect(rounds(done.orderId, "box_missing")).toBe("");

    const late = await paidGift(1);
    await approve(late);
    backdatePaid(late.orderId, "400 hours");
    await runExpiry(late.orderNo);
    expect(rounds(late.orderId, "box_missing")).toBe("box_missing|2");
  });
});

describe("② 차액 기한 시계 = 검수 완료 스캔 (payment INV-M13 S13·S13b · notifications INV-N18 S18c)", () => {
  /** 별빛 → 하루, 소형으로 신고한 상자들을 중형으로 실측(차액 생김) → 검수 완료 스캔. 돌려주는 qrs 는 상자 순서 */
  async function differenceOrder(n: number): Promise<{ orderId: string; orderNo: string; boxIds: string[]; qrs: string[] }> {
    const o = await paidOrder(Array.from({ length: n }, () => "small" as const));
    const op = await staff();
    const qrs: string[] = [];
    for (const boxId of o.boxIds) {
      const qr = await labeled(boxId);
      expect((await measure(qr, "medium")).error).toBeNull();
      expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
      qrs.push(qr);
    }
    return { ...o, qrs };
  }
  const expired = (orderId: string) =>
    psql(`select string_agg((expired_at is not null)::text, ',' order by box_id) from public.payments where order_id = '${orderId}' and kind = 'difference'`);

  it("INV-M13 (S13): 차액 요청이 검수 완료 스캔보다 먼저 생겼어도 기한은 스캔 + 168시간 — 요청 + 200시간·스캔 + 167시간이면 그대로, 스캔 + 168시간이면 반송 대상", async () => {
    const d = await differenceOrder(1);
    shift(`update public.payments set created_at = now() - interval '200 hours' where order_id = '${d.orderId}' and kind = 'difference'`);
    backdateInspected(d.qrs[0]!, "167 hours");
    await runExpiry(d.orderNo);
    expect(expired(d.orderId)).toBe("false");
    backdateInspected(d.qrs[0]!, "168 hours");
    expect((await runExpiry(d.orderNo)).differences).toBe(1);
    expect(expired(d.orderId)).toBe("true");
  });

  it("INV-M13 (S13, 실패경로): 검수 완료 스캔 전의 차액은 요청 뒤 오래돼도 기한이 지나지 않는다 — 결제 준비도 받는다", async () => {
    const o = await paidOrder(["small"]);
    const qr = await labeled(o.boxIds[0]!);
    expect((await measure(qr, "medium")).error).toBeNull();
    shift(`update public.payments set created_at = now() - interval '500 hours' where order_id = '${o.orderId}' and kind = 'difference'`);
    await runExpiry(o.orderNo);
    expect(expired(o.orderId)).toBe("false");
    const prep = await (await signedInClient("byeolbit_fan")).rpc("prepare_difference_payment", { p_box_id: o.boxIds[0] });
    expect(prep.error).toBeNull();
  });

  it("INV-M13·N18 (S13b·S18c): 먼저 검수한 상자 + 71시간 59분이면 없음, 72시간이면 두 번 돌려도 주문에 재알림 한 줄(상자가 둘이어도)", async () => {
    const d = await differenceOrder(2);
    backdateInspected(d.qrs[0]!, "71 hours 59 minutes");
    backdateInspected(d.qrs[1]!, "10 hours");
    await runExpiry(d.orderNo);
    expect(rounds(d.orderId, "difference_due")).toBe("difference_due|1,difference_due|1");
    backdateInspected(d.qrs[0]!, "72 hours");
    await runExpiry(d.orderNo);
    await runExpiry(d.orderNo);
    expect(rounds(d.orderId, "difference_due", SEED.fanId)).toBe("difference_due|1,difference_due|1,difference_due|2");
    // 줄은 먼저 검수 기록한 상자를 가리킨다
    expect(psql(`select parcel_id from public.notification_outbox where order_id = '${d.orderId}' and kind = 'difference_due' and round = 2 and channel = 'email'`)).toBe(parcelIdOf(d.qrs[0]!));
  });

  it("INV-N18 (S18c, 실패경로): 재알림 줄이 대기인 사이 차액이 모두 결제되면 꺼낼 때 건너뜀 — 하나라도 남았으면 보낸다", async () => {
    const d = await differenceOrder(2);
    backdateInspected(d.qrs[0]!, "73 hours");
    await runExpiry(d.orderNo);
    const reminder = `select id from public.notification_outbox where order_id = '${d.orderId}' and kind = 'difference_due' and round = 2 and channel = 'email'`;
    expect(psql(reminder)).not.toBe("");
    // 하나만 결제 — 보낸다
    psql(`update public.payments set status = 'done', settled_at = now(), payment_key = 'pk_test_${d.orderNo}' where order_id = '${d.orderId}' and kind = 'difference' and box_id = '${d.boxIds[0]}'`);
    expect(claimStatus(psql(reminder))).toBe("sending");
    // 둘 다 결제된 주문의 재알림은 건너뜀
    const e = await differenceOrder(1);
    backdateInspected(e.qrs[0]!, "73 hours");
    await runExpiry(e.orderNo);
    psql(`update public.payments set status = 'done', settled_at = now(), payment_key = 'pk_test_${e.orderNo}' where order_id = '${e.orderId}' and kind = 'difference'`);
    const id = psql(`select id from public.notification_outbox where order_id = '${e.orderId}' and kind = 'difference_due' and round = 2 and channel = 'email'`);
    expect(claimStatus(id)).toBe("skipped|difference_not_due");
  });
});

/**
 * 알림 줄 하나만 꺼내 본다 — 다른 대기 줄은 잠시 미래로 미뤄 두고 꺼낸 뒤 되돌린다(한 처리 안). 돌려주는 값은 꺼낸 뒤 그 줄의 「상태|오류 코드」.
 * sending 이면 꺼내기 함수가 보낼 줄로 넘긴 것이다.
 */
function claimStatus(id: string): string {
  return psql(
    [
      "begin;",
      "create temp table held_back on commit drop as select id, next_attempt_at from public.notification_outbox where status = 'pending' and id <> '" + id + "';",
      "update public.notification_outbox n set next_attempt_at = now() + interval '1 day' from held_back h where n.id = h.id;",
      `update public.notification_outbox set next_attempt_at = now() - interval '1 second' where id = '${id}';`,
      "select count(*) from public.notification_claim(100);",
      "update public.notification_outbox n set next_attempt_at = h.next_attempt_at from held_back h where n.id = h.id;",
      "commit;",
      `select status || coalesce('|' || error_code, '') from public.notification_outbox where id = '${id}';`,
    ].join(" "),
  )
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !/^(BEGIN|COMMIT|UPDATE|SELECT|CREATE)/.test(l))
    .slice(-1)[0]!
    .trim();
}

describe("② 크리에이터 확인·추적기 신고 72시간 재알림 (office-workflow INV-W13 S13f · INV-W14 S14e · notifications INV-N13 S13h)", () => {
  const TRACKER = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" } as const;
  const CONFIRM = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" } as const;

  /** 상자 둘 — 첫 상자 추적기 보관, 둘째 상자 크리에이터 확인 대기 */
  async function checkGift(): Promise<{ g: Unit; tracker: string; confirm: string }> {
    const g = await paidGift(2);
    const op = await staff();
    const qrs: string[] = [];
    for (const boxId of g.boxIds) {
      const no = waybill();
      await fanSetsWaybill(boxId, no);
      qrs.push(await receiveAndLabel(op, no));
    }
    expect(await inspect(op, qrs[0]!, TRACKER)).toBe("tracker_held");
    expect(await inspect(op, qrs[1]!, CONFIRM)).toBe("held");
    return { g, tracker: qrs[0]!, confirm: qrs[1]! };
  }
  const HARU = SEED.creatorProfileId;

  it("INV-W13·W14·N13 (S13f·S14e·S13h): 검수 완료 + 71시간 59분이면 없음, 72시간에 두 번 돌려도 하루에게 상자마다 재알림 한 줄 — 별빛에게는 없고 기한은 그대로", async () => {
    const { g, tracker, confirm } = await checkGift();
    backdateInspected(tracker, "71 hours 59 minutes");
    backdateInspected(confirm, "71 hours 59 minutes");
    await runExpiry(g.orderNo);
    expect(rounds(g.orderId, "hold")).toBe("hold|1");
    expect(rounds(g.orderId, "creator_check")).toBe("creator_check|1");
    backdateInspected(tracker, "72 hours");
    backdateInspected(confirm, "72 hours");
    await runExpiry(g.orderNo);
    await runExpiry(g.orderNo);
    expect(rounds(g.orderId, "hold", HARU)).toBe("hold|1,hold|2");
    expect(rounds(g.orderId, "creator_check", HARU)).toBe("creator_check|1,creator_check|2");
    expect(rounds(g.orderId, "hold", SEED.fanId)).toBe("");
    expect([parcelState(tracker), parcelState(confirm)]).toEqual(["tracker_held", "held"]);
  });

  it("INV-W13·W14 (S13f·S14e, 실패경로): 72시간 전에 고른 상자에는 재알림이 없다", async () => {
    const { g, tracker, confirm } = await checkGift();
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("choose_creator_check", { p_order_no: g.orderNo, p_box_seq: 1, p_choice: "report" })).error).toBeNull();
    expect((await haru.rpc("choose_creator_check", { p_order_no: g.orderNo, p_box_seq: 2, p_choice: "accept" })).error).toBeNull();
    backdateInspected(tracker, "80 hours");
    backdateInspected(confirm, "80 hours");
    await runExpiry(g.orderNo);
    expect(rounds(g.orderId, "hold")).toBe("hold|1");
    expect(rounds(g.orderId, "creator_check")).toBe("creator_check|1");
  });

  it("INV-N13 (S13h, 실패경로): 재알림 줄이 대기인 사이 하루가 고르면 꺼낼 때 건너뜀 · 고르지 않았으면 보낸다", async () => {
    const { g, tracker, confirm } = await checkGift();
    backdateInspected(tracker, "80 hours");
    backdateInspected(confirm, "80 hours");
    await runExpiry(g.orderNo);
    const idOf = (kind: string) =>
      psql(`select id from public.notification_outbox where order_id = '${g.orderId}' and kind = '${kind}' and round = 2 and channel = 'email'`);
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("choose_creator_check", { p_order_no: g.orderNo, p_box_seq: 2, p_choice: "accept" })).error).toBeNull();
    expect(claimStatus(idOf("creator_check"))).toBe("skipped|check_not_waiting");
    expect(claimStatus(idOf("hold"))).toBe("sending");
  });
});

describe("③ 주인 없는 상자 — 보류 사유와 상관없이 도착 + 720시간 (inbound-address-code INV-C6·C9 · office-workflow INV-W6)", () => {
  const STAFF_ID = () => psql("select id from public.profiles where login_id = 'fankkuk_staff'");
  /** 보류 줄을 사유별로 바로 넣는다(시험 선반 T-D) — 자동 처리는 도착 시각만 본다 */
  function heldRow(reason: "void_code" | "waybill_dispute" | "no_code"): string {
    return psql(
      `insert into public.office_unmatched (waybill_no, shelf, recorded_by, carrier, reason) values ('${waybill()}', 'T-D', '${STAFF_ID()}', 'cj', '${reason}') returning id`,
    )
      .split(/\r?\n/)[0]!
      .trim();
  }
  const heldState = (id: string) =>
    psql(`select case when matched_parcel_id is not null then 'matched' when expired_at is not null then 'expired' else 'waiting' end from public.office_unmatched where id = '${id}'`);
  const arrivedAgo = (ids: string[], hours: string) =>
    psql(`update public.office_unmatched set arrived_at = now() - interval '${hours}' where id in ('${ids.join("','")}')`);

  it("INV-C6·W6 (S6·S6d): 무효 6자리·같은 송장번호 분쟁·6자리 없음 셋 다 도착 + 168시간·719시간에 그대로, 720시간에 반송 대상(두 번 돌려도 한 번)", async () => {
    const ids = [heldRow("void_code"), heldRow("waybill_dispute"), heldRow("no_code")];
    arrivedAgo(ids, "168 hours");
    await runExpiry();
    expect(ids.map(heldState)).toEqual(["waiting", "waiting", "waiting"]);
    arrivedAgo(ids, "719 hours");
    await runExpiry();
    expect(ids.map(heldState)).toEqual(["waiting", "waiting", "waiting"]);
    arrivedAgo(ids, "720 hours");
    await runExpiry();
    expect(ids.map(heldState)).toEqual(["expired", "expired", "expired"]);
    const again = psql(`select count(*) from public.office_unmatched where id in ('${ids.join("','")}') and expired_at < now() - interval '0 seconds'`);
    await runExpiry();
    expect(psql(`select count(*) from public.office_unmatched where id in ('${ids.join("','")}') and expired_at is not null`)).toBe("3");
    expect(again).toBe("3");
  });

  /** 6자리로 입고한 상자를 사유 reason 으로 주문에 묶인 채 보류로 둔다 */
  async function heldParcel(reason: "not_mine" | "code_dispute"): Promise<{ g: Unit; qr: string }> {
    const g = await paidGift(1);
    const op = await staff();
    const r = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0]! }) });
    const qr = (r.data as { qr: string }).qr;
    expect((await op.rpc("office_confirm_label", { p_qr: qr })).error).toBeNull();
    shift(`update public.office_parcels set hold_reason = '${reason}', hold_at = now() where qr_code = '${qr}'`);
    return { g, qr };
  }
  const closed = (qr: string) => psql(`select (hold_closed_at is not null)::text from public.office_parcels where qr_code = '${qr}'`);
  const times = (qr: string, received: string, hold: string) =>
    shift(`update public.office_parcels set received_at = now() - interval '${received}', hold_at = now() - interval '${hold}' where qr_code = '${qr}'`);

  it("INV-C9 (S9c): 「내가 보낸 게 아님」으로 보류된 옛 상자는 운영자가 바로 넘길 수 있고, 아무도 안 넘기면 도착 + 719시간 그대로·720시간 자동으로 넘김(두 번 돌려도 한 번)", async () => {
    const a = await heldParcel("not_mine");
    const id = parcelIdOf(a.qr);
    expect((await (await staff()).rpc("admin_return_held_parcel", { p_id: id })).error).toBeNull();
    expect(closed(a.qr)).toBe("true");

    const b = await heldParcel("not_mine");
    times(b.qr, "719 hours", "500 hours");
    await runExpiry(b.g.orderNo);
    expect(closed(b.qr)).toBe("false");
    times(b.qr, "720 hours", "500 hours");
    expect((await runExpiry(b.g.orderNo)).held_parcels).toBe(1);
    expect((await runExpiry(b.g.orderNo)).held_parcels).toBe(0);
    expect(closed(b.qr)).toBe("true");
  });

  it("INV-C9 (S9e): 같은 6자리 분쟁 보류 상자는 보류 + 168시간 자동 처리에 그대로(운영자는 넘길 수 있음), 도착 + 720시간에 자동으로 넘김 · 도착 + 700시간에 보류된 상자는 보류 + 168시간까지 기다린다", async () => {
    const a = await heldParcel("code_dispute");
    times(a.qr, "200 hours", "168 hours");
    await runExpiry(a.g.orderNo);
    expect(closed(a.qr)).toBe("false");
    times(a.qr, "720 hours", "168 hours");
    await runExpiry(a.g.orderNo);
    expect(closed(a.qr)).toBe("true");

    const b = await heldParcel("code_dispute");
    times(b.qr, "720 hours", "20 hours"); // 도착 + 700시간에 보류
    await runExpiry(b.g.orderNo);
    expect(closed(b.qr)).toBe("false");
    times(b.qr, "868 hours", "168 hours");
    await runExpiry(b.g.orderNo);
    expect(closed(b.qr)).toBe("true");

    // 보류 + 168시간이 지난 분쟁 상자는 자동 처리 전에도 운영자가 넘길 수 있다
    const c = await heldParcel("code_dispute");
    times(c.qr, "200 hours", "168 hours");
    expect((await (await staff()).rpc("admin_return_held_parcel", { p_id: parcelIdOf(c.qr) })).error).toBeNull();
  });
});
