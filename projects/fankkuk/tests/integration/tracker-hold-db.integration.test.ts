import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, psql, SEED, signedInClient } from "./helpers";
import { deleteTestUnmatched, FAN_PASS, fanSetsWaybill, inspect, paidGift, paidShare, parcelState, receiveAndLabel, SHARE_PASS, waybill, creatorSetsWaybill, type Unit } from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 추적기 보관 → 크리에이터가 신고 여부를 고른다 (office-workflow INV-W14·W4·W1·W6·W8·W9, notifications INV-N13, action-center INV-J5, payment INV-M8)
// · 추적기 판정 이력이 있는 팬의 상자는 연다 (office-workflow INV-W16). 2026-10-17 카드 d100·d101.
// 시드: 하루(haru_creator)·모모(momo_creator) = 크리에이터, 별빛(byeolbit_fan) = 보낸 팬, fankkuk_staff = 직원, fankkuk_admin = 대표.
// 읽기 결과는 시드 주문이 섞일 수 있어 이 시험이 만든 주문번호로 거른다.

const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const TRACKER = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" } as const;
const CONFIRM = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" } as const;
// 팬 화면이 추적기 보관·신고 보관·경찰 인계 상자를 부르는 한 값(INV-W14 「확인 중」)
const CHECKING = "checking";

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

/** 상자 n 개 주문(별빛 → creatorId, 기본 하루) — 모두 입고·라벨 부착. 돌려주는 qrs 는 상자 순서 */
async function arrived(n = 1, creatorId?: string): Promise<{ g: Unit; qrs: string[] }> {
  const g = await paidGift(n, creatorId);
  const op = await staff();
  const qrs: string[] = [];
  for (const boxId of g.boxIds) {
    const no = waybill();
    await fanSetsWaybill(boxId, no);
    qrs.push(await receiveAndLabel(op, no));
  }
  return { g, qrs };
}

/** 첫 상자를 추적기로 판정해 검수 완료 스캔까지 — 추적기 보관 */
async function trackerGift(n = 1, creatorId?: string): Promise<{ g: Unit; qrs: string[] }> {
  const a = await arrived(n, creatorId);
  expect(await inspect(await staff(), a.qrs[0]!, TRACKER)).toBe("tracker_held");
  return a;
}

const choose = async (orderNo: string, seq: number, choice: string, login = "haru_creator") =>
  (await signedInClient(login)).rpc("choose_creator_check", { p_order_no: orderNo, p_box_seq: seq, p_choice: choice });
const cancel = async (orderNo: string, seq: number, login = "haru_creator") =>
  (await signedInClient(login)).rpc("cancel_creator_check", { p_order_no: orderNo, p_box_seq: seq });
const processCheck = async (qr: string, seen: string, login = "fankkuk_staff") =>
  (await signedInClient(login)).rpc("office_process_creator_check", { p_qr: qr, p_seen_choice: seen });
const handover = async (qr: string, memo: string, login = "fankkuk_staff") =>
  (await signedInClient(login)).rpc("office_record_police_handover", { p_qr: qr, p_memo: memo });

/** 그 주문의 알림 줄 중 계정·종류별 이메일 줄 수 */
const alerts = (orderId: string, kind: string, account: string) =>
  psql(`select count(*) from public.notification_outbox n where n.order_id = '${orderId}' and n.kind = '${kind}' and n.account_id = '${account}' and n.channel = 'email'`);
const HARU = SEED.creatorProfileId;
const BYEOLBIT = SEED.fanId;

const backdateInspected = (qr: string, interval: string) => psql(`update public.office_parcels set inspected_at = now() - interval '${interval}' where qr_code = '${qr}'`);
async function runExpiry(orderNo: string): Promise<void> {
  const r = await (await staff()).rpc("office_run_expiry", { p_order_no: orderNo });
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.code} ${r.error.message}`);
}
const checkRow = (qr: string) =>
  psql(
    `select k.kind || '|' || coalesce(k.choice, '-') || '|' || coalesce(k.answer, '-') || '|' || (k.answered_by is not null) from public.office_creator_checks k join public.office_parcels p on p.id = k.parcel_id where p.qr_code = '${qr}'`,
  );
const orderRefundDue = (orderId: string) =>
  psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);

/** 보낸 팬(별빛)이 보는 그 주문의 검수 결과·상자 상태·함께한 선물 결과 */
async function fanView(g: Unit): Promise<{ result: unknown; boxes: unknown[]; together: unknown }> {
  const fan = await signedInClient("byeolbit_fan");
  const one = await fan.rpc("my_gift", { p_order_no: g.orderNo });
  const boxes = await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo });
  const creatorId = psql(`select creator_id from public.orders where id = '${g.orderId}'`);
  const together = await fan.rpc("my_together_gifts", { p_creator_id: creatorId });
  if (one.error || boxes.error || together.error) throw new Error(`팬 읽기 실패: ${one.error?.code} ${boxes.error?.code} ${together.error?.code}`);
  const row = (one.data as { inspection_result: unknown }[])[0];
  const t = (together.data as { order_no: string; outcome: unknown }[]).find((r) => r.order_no === g.orderNo);
  return { result: row?.inspection_result, boxes: (boxes.data as { state: unknown }[]).map((b) => b.state), together: t?.outcome };
}

/** 응답 JSON 에 신고·추적기·경찰·개봉 꼴의 값·칸 이름이 있는가(팬 칸 reported_not_mine 은 「제가 보낸 게 아니에요」라 따로 둔다) */
function leaks(data: unknown): string[] {
  const text = JSON.stringify(data).replaceAll("reported_not_mine", "");
  return ["report", "tracker", "police", "handed", "opened", "open_target", "추적", "신고", "경찰", "개봉"].filter((w) => text.includes(w));
}

describe("추적기 보관 (office-workflow INV-W4·W14, notifications INV-N13)", () => {
  it("INV-W4·W14 (S4c): 추적기로 판정한 팬 선물은 검수 완료 스캔에서 반송 대기가 아니라 추적기 보관, 크리에이터 알림 1건, 팬 알림 없음, 팬 화면은 「확인 중」", async () => {
    const { g, qrs } = await trackerGift(2);
    expect(parcelState(qrs[0]!)).toBe("tracker_held");
    expect(psql(`select count(*) from public.office_hold_alerts h join public.office_parcels p on p.id = h.parcel_id where p.qr_code = '${qrs[0]}'`)).toBe("1");
    expect(alerts(g.orderId, "hold", HARU)).toBe("1");
    expect(alerts(g.orderId, "hold_fan", BYEOLBIT)).toBe("0");
    expect(checkRow(qrs[0]!)).toBe("tracker|-|-|false");
    const view = await fanView(g);
    expect(view.result).toBe(CHECKING);
    expect(view.boxes).toEqual([CHECKING, "labeled"]);
    expect(view.together).toBe(CHECKING);
  });

  it("INV-N13 (S13g): 추적기 보관 알림(hold)은 상자마다 한 번 — 같은 주문의 두 번째 추적기 상자에도 따로 간다, 팬 몫 줄은 없다", async () => {
    const { g, qrs } = await trackerGift(2);
    expect(await inspect(await staff(), qrs[1]!, TRACKER)).toBe("tracker_held");
    expect(alerts(g.orderId, "hold", HARU)).toBe("2");
    expect(psql(`select count(distinct parcel_id) from public.notification_outbox where order_id = '${g.orderId}' and kind = 'hold' and channel = 'email'`)).toBe("2");
    expect(psql(`select count(*) from public.notification_outbox where order_id = '${g.orderId}' and account_id = '${BYEOLBIT}' and kind like 'hold%'`)).toBe("0");
  });

  it("INV-W4 (S4e): 추적기 보관 결과는 실측 없이도 추적기 보관으로 넘어간다", async () => {
    const { qrs } = await arrived(1);
    const op = await staff();
    expect((await op.rpc("office_record_inspection", { p_qr: qrs[0], p_result: TRACKER })).error).toBeNull();
    expect(psql(`select coalesce(b.measured_tier::text, '-') from public.office_parcels p join public.boxes b on b.id = p.box_id where p.qr_code = '${qrs[0]}'`)).toBe("-");
    expect((await op.rpc("office_scan_inspect", { p_qr: qrs[0] })).data).toBe("tracker_held");
  });
});

describe("신고 고르기·처리·기한 (office-workflow INV-W14·W13·W6)", () => {
  it("INV-W14 (S14): 「신고하지 않기」를 고르고 운영자가 처리하면 반송 대기, 별빛 「돌려보낼 상자」 1건. 처리 전까지는 보관 그대로", async () => {
    const { g, qrs } = await trackerGift();
    expect((await choose(g.orderNo, 1, "no_report")).data).toBe("chosen");
    expect(parcelState(qrs[0]!)).toBe("tracker_held");
    expect(alerts(g.orderId, "hold_fan", BYEOLBIT)).toBe("0");
    expect((await processCheck(qrs[0]!, "no_report")).data).toBe("not_reported");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkRow(qrs[0]!)).toBe("tracker|no_report|no_report|true");
    expect(alerts(g.orderId, "hold_fan", BYEOLBIT)).toBe("1");
    // INV-N13 (S13g): 같은 처리에서 반송 주소 알림은 따로 가지 않는다
    expect(psql(`select count(*) from public.notification_outbox where order_id = '${g.orderId}' and kind like 'return_address%'`)).toBe("0");
    // 반송 대기로 넘어가면 팬에게 다른 검수 반송 상자와 똑같이 보인다
    const view = await fanView(g);
    expect(view.result).toBe("returned");
    expect(view.boxes).toEqual(["return_waiting"]);
  });

  it("INV-W14·W8 (S14): 「신고하기」를 고르고 처리하면 신고 보관, 팬 화면은 「확인 중」 그대로. 경찰 인계를 기록하면 끝, 봉투 파쇄 1건, 반송 송장을 출력할 수 없다", async () => {
    const { g, qrs } = await trackerGift();
    expect((await choose(g.orderNo, 1, "report")).data).toBe("chosen");
    expect((await processCheck(qrs[0]!, "report")).data).toBe("reported");
    expect(parcelState(qrs[0]!)).toBe("report_held");
    expect(alerts(g.orderId, "hold_fan", BYEOLBIT)).toBe("0");
    expect((await fanView(g)).result).toBe(CHECKING);

    expect((await handover(qrs[0]!, "관할 경찰서 담당자에게 인계")).data).toBe("handed");
    expect(parcelState(qrs[0]!)).toBe("police_handed");
    expect(psql(`select count(*) from public.office_envelope_shreds s join public.office_parcels p on p.id = s.parcel_id where p.qr_code = '${qrs[0]}'`)).toBe("1");
    expect(psql(`select h.memo || '|' || (h.handed_by is not null) from public.office_police_handovers h join public.office_parcels p on p.id = h.parcel_id where p.qr_code = '${qrs[0]}'`)).toBe(
      "관할 경찰서 담당자에게 인계|true",
    );
    const view = await fanView(g);
    expect(view.result).toBe(CHECKING);
    expect(view.boxes).toEqual([CHECKING]);
    expect(alerts(g.orderId, "hold_fan", BYEOLBIT)).toBe("0");
    expect((await (await staff()).rpc("office_print_return_label", { p_qr: qrs[0], p_waybill: "700000000123" })).error?.code).toBe("55000");
    // 인계 기록은 추가만 — 두 번째 인계·고치기·지우기는 거부
    expect((await handover(qrs[0]!, "다시")).error?.code).toBe("55000");
    expect(psql(`do $$ begin update public.office_police_handovers set memo = 'x'; exception when others then raise notice 'blocked'; end $$;`)).toBe("DO");
    expect(psql(`select count(*) from public.office_police_handovers where memo = 'x'`)).toBe("0");
  });

  it("INV-W14·W13: 고르기는 신고하기·신고하지 않기뿐이고, 취소하면 다시 고른다. 운영자가 본 선택과 다르면 「바뀜」, 처리 뒤 취소는 「이미 처리됨」", async () => {
    const { g, qrs } = await trackerGift();
    expect((await choose(g.orderNo, 1, "accept")).error?.code).toBe("22023");
    expect((await choose(g.orderNo, 1, "report")).data).toBe("chosen");
    expect((await choose(g.orderNo, 1, "no_report")).data).toBe("already_chosen");
    expect((await processCheck(qrs[0]!, "no_report")).data).toBe("changed");
    expect((await cancel(g.orderNo, 1)).data).toBe("cancelled");
    expect((await processCheck(qrs[0]!, "report")).data).toBe("no_choice");
    expect((await choose(g.orderNo, 1, "no_report")).data).toBe("chosen");
    expect((await processCheck(qrs[0]!, "no_report")).data).toBe("not_reported");
    expect((await cancel(g.orderNo, 1)).data).toBe("processed");
    expect(psql(`select string_agg(e.action || ':' || coalesce(e.choice, '-'), ',' order by e.id) from public.office_creator_check_events e join public.office_parcels p on p.id = e.parcel_id where p.qr_code = '${qrs[0]}'`)).toBe(
      "choose:report,cancel:-,choose:no_report",
    );
  });

  it("INV-W14 (실패경로): 다른 크리에이터·보낸 팬의 고르기·취소는 「없음」, 크리에이터·팬이 운영자 처리를 부르면 거부", async () => {
    const { g, qrs } = await trackerGift();
    for (const who of ["momo_creator", "byeolbit_fan"]) {
      expect((await choose(g.orderNo, 1, "report", who)).data).toBe("not_found");
      expect((await cancel(g.orderNo, 1, who)).data).toBe("not_found");
    }
    expect((await choose(g.orderNo, 1, "report")).data).toBe("chosen");
    for (const who of ["haru_creator", "byeolbit_fan"]) expect((await processCheck(qrs[0]!, "report", who)).error?.code).toBe("42501");
    expect(parcelState(qrs[0]!)).toBe("tracker_held");
  });

  it("INV-W14·W6 (S14b): 고른 것이 없으면 검수 완료 + 167시간 59분에는 그대로, 168시간 자동 처리는 반송 대기와 팬 알림 1건(두 번 돌려도 한 번), 그 뒤 고르기는 「기한 지남」", async () => {
    const { g, qrs } = await trackerGift();
    backdateInspected(qrs[0]!, "167 hours 59 minutes");
    await runExpiry(g.orderNo);
    expect(parcelState(qrs[0]!)).toBe("tracker_held");
    backdateInspected(qrs[0]!, "168 hours");
    expect((await choose(g.orderNo, 1, "report")).data).toBe("expired");
    await runExpiry(g.orderNo);
    await runExpiry(g.orderNo);
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkRow(qrs[0]!)).toBe("tracker|-|expired|false");
    expect(alerts(g.orderId, "hold_fan", BYEOLBIT)).toBe("1");
    expect((await choose(g.orderNo, 1, "report")).data).toBe("expired");
  });

  it("INV-W14·W6 (S14b): 「신고하기」를 고른 채 기한이 지나면 신고 보관(팬 알림 없음), 「신고하지 않기」를 고른 채면 반송 대기와 팬 알림", async () => {
    const reported = await trackerGift();
    expect((await choose(reported.g.orderNo, 1, "report")).data).toBe("chosen");
    backdateInspected(reported.qrs[0]!, "168 hours");
    await runExpiry(reported.g.orderNo);
    expect(parcelState(reported.qrs[0]!)).toBe("report_held");
    expect(checkRow(reported.qrs[0]!)).toBe("tracker|report|report|false");
    expect(alerts(reported.g.orderId, "hold_fan", BYEOLBIT)).toBe("0");

    const notReported = await trackerGift();
    expect((await choose(notReported.g.orderNo, 1, "no_report")).data).toBe("chosen");
    backdateInspected(notReported.qrs[0]!, "168 hours");
    await runExpiry(notReported.g.orderNo);
    expect(parcelState(notReported.qrs[0]!)).toBe("return_waiting");
    expect(checkRow(notReported.qrs[0]!)).toBe("tracker|no_report|no_report|false");
    expect(alerts(notReported.g.orderId, "hold_fan", BYEOLBIT)).toBe("1");
  });

  // 검수 반송이 있는 주문은 크리에이터가 거절할 수 없어서(기존 거절 규칙) 「거절 뒤 도착해 추적기로 판정」과 「추적기 보관 뒤 7일 자동 반려」 두 길로 본다
  it("INV-W14 (S14c, 실패경로): 거절로 끝난 주문의 상자가 추적기로 판정되면 반송 대기가 아니라 추적기 보관이고 신고 선택을 받는다. 다른 상자는 반송 대기", async () => {
    const { g, qrs } = await arrived(2);
    const op = await staff();
    expect(await inspect(op, qrs[1]!, FAN_PASS)).toBe("inspected");
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false })).data).toMatchObject({ result: "declined" });
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("rejected");
    expect(await inspect(op, qrs[0]!, TRACKER)).toBe("tracker_held");
    expect(parcelState(qrs[1]!)).toBe("return_waiting");
    await runExpiry(g.orderNo);
    expect(parcelState(qrs[0]!)).toBe("tracker_held");
    expect((await choose(g.orderNo, 1, "report")).data).toBe("chosen");
    expect((await processCheck(qrs[0]!, "report")).data).toBe("reported");
    expect(parcelState(qrs[0]!)).toBe("report_held");
  });

  it("INV-W14 (S14c, 실패경로): 추적기 보관 상자가 있는 주문이 7일 자동 반려로 끝나도 그 상자는 추적기 보관 그대로, 신고 선택을 받는다", async () => {
    const { g, qrs } = await trackerGift();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    await runExpiry(g.orderNo);
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("expired");
    expect(parcelState(qrs[0]!)).toBe("tracker_held");
    expect((await choose(g.orderNo, 1, "no_report")).data).toBe("chosen");
  });

  it("INV-W14 (S14d, 실패경로): 신고 보관 상자의 팬 읽기에는 「확인 중」만 있고 신고·추적기 꼴의 값이 없다. 운영자가 아닌 계정의 경찰 인계 기록은 거부, 메모는 1~200자", async () => {
    const { g, qrs } = await trackerGift();
    expect((await choose(g.orderNo, 1, "report")).data).toBe("chosen");
    expect((await processCheck(qrs[0]!, "report")).data).toBe("reported");
    const fan = await signedInClient("byeolbit_fan");
    const reads = [
      (await fan.rpc("my_gift", { p_order_no: g.orderNo })).data,
      (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data,
      (await fan.rpc("my_gifts")).data,
      (await fan.rpc("my_action_items")).data,
    ];
    for (const data of reads) expect(leaks(data)).toEqual([]);
    expect(JSON.stringify(reads[0])).toContain(CHECKING);

    for (const who of ["byeolbit_fan", "haru_creator"]) expect((await handover(qrs[0]!, "인계", who)).error?.code).toBe("42501");
    expect((await anonClient().rpc("office_record_police_handover", { p_qr: qrs[0], p_memo: "인계" })).error).not.toBeNull();
    expect((await handover(qrs[0]!, " ")).error?.code).toBe("22023");
    expect((await handover(qrs[0]!, "가".repeat(201))).error?.code).toBe("22023");
    expect(parcelState(qrs[0]!)).toBe("report_held");
    // 신고 보관 전(추적기 보관) 상자의 인계는 단계 거부
    const other = await trackerGift();
    expect((await handover(other.qrs[0]!, "인계")).error?.code).toBe("55000");
  });

  it("INV-W14·W1: 추적기 보관·신고 보관 상자는 반송 송장을 출력할 수 없고 출고 단계로도 가지 않는다", async () => {
    const { qrs } = await trackerGift();
    const op = await staff();
    expect((await op.rpc("office_print_return_label", { p_qr: qrs[0], p_waybill: "700000000124" })).error?.code).toBe("55000");
    const detail = (await op.rpc("office_parcel_by_qr", { p_qr: qrs[0] })).data as { state: string; next_step: string }[];
    expect(detail[0]).toMatchObject({ state: "tracker_held", next_step: "tracker_held" });
  });
});

describe("추적기 보관의 환불 (office-workflow INV-W14, payment INV-M8)", () => {
  it("INV-W4·W14 (S4f): 신고 보관·경찰 인계·반송 어느 쪽으로 끝나도 환불은 상품 대금 칸만(지금 0원)으로 같다", async () => {
    const goods = (orderId: string) => psql(`select goods_krw from public.payments where order_id = '${orderId}' and kind = 'initial'`);
    const ends: string[] = [];
    for (const path of ["report", "handover", "no_report"] as const) {
      const { g, qrs } = await trackerGift();
      expect((await choose(g.orderNo, 1, path === "no_report" ? "no_report" : "report")).data).toBe("chosen");
      await processCheck(qrs[0]!, path === "no_report" ? "no_report" : "report");
      if (path === "handover") expect((await handover(qrs[0]!, "인계")).data).toBe("handed");
      expect(orderRefundDue(g.orderId)).toBe(goods(g.orderId));
      ends.push(orderRefundDue(g.orderId));
    }
    expect(ends).toEqual(["0", "0", "0"]);
  });

  it("INV-M8·M9: 거절로 끝난 주문의 상자가 추적기 보관이면 그 상자 몫은 0(검수 불합격 줄), 통과한 상자는 상자 금액 − 배송비 칸", async () => {
    const { g, qrs } = await arrived(2);
    expect(await inspect(await staff(), qrs[1]!, FAN_PASS)).toBe("inspected");
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false })).data).toMatchObject({ result: "declined" });
    expect(await inspect(await staff(), qrs[0]!, TRACKER)).toBe("tracker_held");
    // 소형 6,900 − 배송비 4,000 = 2,900 + 추적기 상자 0
    expect(orderRefundDue(g.orderId)).toBe("2900");
  });
});

describe("크리에이터 쪽 읽기 (action-center INV-J5, office-workflow INV-W9)", () => {
  type Row = { kind: string; board: string; order_no: string; box_seq: number | null; choice: string | null };
  async function lines(orderNos: readonly string[]): Promise<string[]> {
    const r = await (await signedInClient("haru_creator")).rpc("my_creator_action_items");
    if (r.error) throw new Error(`my_creator_action_items 실패: ${r.error.code} ${r.error.message}`);
    return (r.data as Row[]).filter((x) => orderNos.includes(x.order_no)).map((x) => `${x.board}:${x.kind}:${x.order_no}:${x.box_seq ?? "-"}:${x.choice ?? "-"}`);
  }

  it("INV-J5 (S5d): 고른 것 없는 추적기 보관, 거절로 끝난 주문의 추적기 보관은 「추적 장치 발견」 줄, 신고하기를 처리한 상자는 없다. 받은 선물 판 맨 위, 기한 지나면 없다", async () => {
    const waiting = await paidGift(1);
    const open = await trackerGift();
    const ended = await arrived(1);
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: ended.g.requestId, p_block: false })).data).toMatchObject({ result: "declined" });
    expect(await inspect(await staff(), ended.qrs[0]!, TRACKER)).toBe("tracker_held");
    const done = await trackerGift();
    expect((await choose(done.g.orderNo, 1, "report")).data).toBe("chosen");
    expect((await processCheck(done.qrs[0]!, "report")).data).toBe("reported");
    const confirm = await arrived(1);
    expect(await inspect(await staff(), confirm.qrs[0]!, CONFIRM)).toBe("held");

    expect((await choose(open.g.orderNo, 1, "no_report")).data).toBe("chosen");
    const nos = [waiting.orderNo, open.g.orderNo, ended.g.orderNo, done.g.orderNo, confirm.g.orderNo];
    const got = await lines(nos);
    expect(got.filter((l) => l.includes(":tracker:"))).toEqual([`received:tracker:${open.g.orderNo}:1:no_report`, `received:tracker:${ended.g.orderNo}:1:-`]);
    // 받은 선물 판의 순서: 추적 장치 발견 → 블루투스 발견 → 승인 요청
    const kinds = got.map((l) => l.split(":")[1]);
    expect(kinds.indexOf("bluetooth")).toBeGreaterThan(kinds.lastIndexOf("tracker"));
    expect(kinds.indexOf("approval")).toBeGreaterThan(kinds.indexOf("bluetooth"));

    backdateInspected(open.qrs[0]!, "168 hours");
    backdateInspected(ended.qrs[0]!, "168 hours");
    expect((await lines(nos)).filter((l) => l.includes(":tracker:"))).toEqual([]);
  });

  it("INV-W9: 크리에이터가 받은 선물 읽기에서 추적기 보관·신고 보관 주문의 검수 결과는 「보관」, 반송 대기로 넘어가면 「반송」", async () => {
    const { g, qrs } = await trackerGift();
    const result = async () =>
      ((await (await signedInClient("haru_creator")).rpc("my_incoming_gifts")).data as { order_no: string; inspection_result: string | null }[]).find((r) => r.order_no === g.orderNo)
        ?.inspection_result;
    expect(await result()).toBe("held");
    expect((await choose(g.orderNo, 1, "no_report")).data).toBe("chosen");
    expect((await processCheck(qrs[0]!, "no_report")).data).toBe("not_reported");
    expect(await result()).toBe("returned");
  });

  it("INV-W14: 운영자 목록(admin_creator_check_choices)에 고른 추적기 상자가 신고 선택과 함께 나온다", async () => {
    const { g, qrs } = await trackerGift();
    expect((await choose(g.orderNo, 1, "report")).data).toBe("chosen");
    const rows = (await (await staff()).rpc("admin_creator_check_choices")).data as { qr: string; choice: string }[];
    expect(rows.find((r) => r.qr === qrs[0])?.choice).toBe("report");
  });
});

describe("추적기 판정 이력이 있는 팬의 상자는 연다 (office-workflow INV-W16)", () => {
  /** 별빛이 모모에게 보낸 상자를 추적기로 판정해 둔다 — 이력 만들기 */
  async function flagByeolbit(): Promise<void> {
    await trackerGift(1, MOMO_CREATOR_ID);
  }
  const record = async (qr: string, result: Record<string, string>) => (await staff()).rpc("office_record_inspection", { p_qr: qr, p_result: result });
  const openedOf = (qr: string) =>
    psql(`select coalesce(i.opened, '-') from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${qr}'`);

  it("INV-W16 (S16): 다른 크리에이터에게 보낸 상자가 추적기로 판정된 적이 있는 별빛의 새 상자 — 개봉 결과가 없으면 거부, 「장치 없음」이면 기록, 검수 화면에 개봉 대상", async () => {
    const { qrs } = await arrived(1);
    const op = await staff();
    expect(((await op.rpc("office_parcel_by_qr", { p_qr: qrs[0] })).data as { open_target: boolean }[])[0]?.open_target).toBe(false);
    await flagByeolbit();
    expect(((await op.rpc("office_parcel_by_qr", { p_qr: qrs[0] })).data as { open_target: boolean }[])[0]?.open_target).toBe(true);
    expect((await record(qrs[0]!, FAN_PASS)).error?.code).toBe("22023");
    expect((await record(qrs[0]!, { ...FAN_PASS, opened: "maybe" })).error?.code).toBe("22023");
    expect((await record(qrs[0]!, { ...FAN_PASS, opened: "none" })).error).toBeNull();
    expect(openedOf(qrs[0]!)).toBe("none");
  });

  it("INV-W16 (S16): 개봉 대상 상자에서 「장치 나옴」이면 판정 칸이 있어야 하고, 판정과 결론은 블루투스 반응과 같은 짝을 따른다", async () => {
    await flagByeolbit();
    const { qrs } = await arrived(3);
    expect((await record(qrs[0]!, { ...FAN_PASS, opened: "device" })).error?.code).toBe("22023");
    expect((await record(qrs[0]!, { ...FAN_PASS, opened: "device", tracker_verdict: "tracker" })).error?.code).toBe("22023");
    expect((await record(qrs[0]!, { bluetooth: "clear", rf: "clear", metal: "clear", opened: "device", tracker_verdict: "tracker", outcome: "hold" })).error).toBeNull();
    expect((await record(qrs[1]!, { bluetooth: "clear", rf: "clear", metal: "clear", opened: "device", tracker_verdict: "not_tracker", outcome: "pass" })).error?.code).toBe("22023");
    expect((await record(qrs[1]!, { bluetooth: "clear", rf: "clear", metal: "clear", opened: "device", tracker_verdict: "not_tracker", outcome: "return" })).error).toBeNull();
    // 「장치 없음」에 반응도 없으면 판정 칸이 없다
    expect((await record(qrs[2]!, { ...FAN_PASS, opened: "none", tracker_verdict: "not_tracker" })).error?.code).toBe("22023");
    expect(openedOf(qrs[0]!)).toBe("device");
    expect((await (await staff()).rpc("office_scan_inspect", { p_qr: qrs[0] })).data).toBe("tracker_held");
  });

  it("INV-W16 (S16b, 실패경로): 추적기 판정 이력이 없는 팬의 상자에 개봉 결과를 넣으면 거부, 역조공 기록에 개봉 결과도 거부", async () => {
    const { qrs } = await arrived(1);
    expect((await record(qrs[0]!, { ...FAN_PASS, opened: "none" })).error?.code).toBe("22023");
    expect(openedOf(qrs[0]!)).toBe("");
    const s = await paidShare();
    const no = waybill();
    await creatorSetsWaybill(s.shareId, no);
    const shareQr = await receiveAndLabel(await staff(), no);
    expect((await record(shareQr, { ...SHARE_PASS, opened: "none" })).error?.code).toBe("22023");
  });

  it("INV-W16 (실패경로): 표에 직접 넣어도 — 대상이 아닌 상자의 개봉 결과, 대상인 상자의 빈 개봉 결과, 「장치 나옴」인데 판정 없음, 역조공 칸에 개봉 결과는 거부", async () => {
    const plain = await arrived(1);
    const insertRow = (qr: string, cols: string) =>
      psql(
        `do $$ begin insert into public.office_inspections (parcel_id, inspected_by, bluetooth, rf, metal, surface, prohibited, tracker_verdict, opened, outcome)
           select p.id, (select id from public.profiles where login_id = 'fankkuk_staff'), ${cols} from public.office_parcels p where p.qr_code = '${qr}';
           raise notice 'inserted'; exception when others then raise notice 'refused %', sqlstate; end $$;`,
      );
    insertRow(plain.qrs[0]!, "'clear', 'clear', 'clear', null, null, null, 'none', 'pass'");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${plain.qrs[0]}'`)).toBe("0");

    await flagByeolbit();
    const target = await arrived(2);
    insertRow(target.qrs[0]!, "'clear', 'clear', 'clear', null, null, null, null, 'pass'");
    insertRow(target.qrs[1]!, "'clear', 'clear', 'clear', null, null, null, 'device', 'pass'");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code in ('${target.qrs[0]}', '${target.qrs[1]}')`)).toBe("0");
    // 같은 표에 맞는 줄은 들어간다 — 막는 것이 표 전체가 아님을 본다
    insertRow(target.qrs[0]!, "'clear', 'clear', 'clear', null, null, null, 'none', 'pass'");
    expect(psql(`select count(*) from public.office_inspections i join public.office_parcels p on p.id = i.parcel_id where p.qr_code = '${target.qrs[0]}'`)).toBe("1");
  });

  it("INV-W16 (S16c): 개봉 대상 상자의 크리에이터 읽기(선물 현황·처리할 일)와 보낸 팬 읽기(선물 상세·상자)에 개봉 꼴의 값이 없다", async () => {
    await flagByeolbit();
    const { g, qrs } = await arrived(1);
    expect(await inspect(await staff(), qrs[0]!, { ...FAN_PASS, opened: "none" })).toBe("inspected");
    const haru = await signedInClient("haru_creator");
    const fan = await signedInClient("byeolbit_fan");
    const reads = [
      ((await haru.rpc("my_incoming_gifts")).data as { order_no: string }[]).filter((r) => r.order_no === g.orderNo),
      ((await haru.rpc("my_gift_progress")).data as { order_no: string }[]).filter((r) => r.order_no === g.orderNo),
      ((await haru.rpc("my_creator_action_items")).data as { order_no: string }[]).filter((r) => r.order_no === g.orderNo),
      (await fan.rpc("my_gift", { p_order_no: g.orderNo })).data,
      (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data,
    ];
    expect(reads[0]).toHaveLength(1);
    for (const data of reads) expect(leaks(data)).toEqual([]);
  });
});
