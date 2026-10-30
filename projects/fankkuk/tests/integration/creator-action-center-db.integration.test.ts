import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, approveRpc, deleteTestOrders, followForTest, holdRowLock, payTestOrder, psql, registerTestOrder, SEED, signedInClient } from "./helpers";
import { approve, codeOf, deleteTestUnmatched, fanSetsWaybill, finishPrint, inspect, orderStatus, paidGift, parcelState, receiveAndLabel, scanInbound, SHARE_PASS, waybill, type Unit } from "./office-helpers";
import { backdateSettlement, deleteTestRevgifts, HARU_CREATOR_ID, PROFILE, revgiftArgs, type TestSend, type Tier } from "./revgift-helpers";

// 크리에이터 처리할 일 (action-center INV-J5~J8) · 블루투스 상자 고르기·취소·운영자 처리·기한(office-workflow INV-W13·W4·W6) ·
// 크리에이터의 미확인 상자 찾기(inbound-address-code INV-C4 ②-나·C10) · 운영자 몫 옮기기(INV-C11) · 역조공 받기 알림(notifications INV-N20).
// 시드: 하루(haru_creator)·모모(momo_creator) = 크리에이터, 별빛(byeolbit_fan)·달토끼·구름빵·솜사탕 = 팬, fankkuk_staff = 직원, fankkuk_admin = 대표.
// 읽기 결과는 시드 주문이 섞일 수 있어 이 시험이 만든 주문번호로 거른다(남의 것이 섞였는지는 거르지 않고 본다).

const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const CONFIRM = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" } as const;

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

type Row = Record<string, unknown> & { kind: string; board: string; order_no: string; box_seq: number | null; due_at: string | null; choice: string | null };

async function items(login: string): Promise<Row[]> {
  const r = await (await signedInClient(login)).rpc("my_creator_action_items");
  if (r.error) throw new Error(`my_creator_action_items 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Row[];
}

/** 이 시험이 만든 주문(몫)번호의 줄만, 「판:종류:번호:상자」 꼴로 — 순서 그대로 */
async function lines(login: string, orderNos: readonly string[]): Promise<string[]> {
  return (await items(login)).filter((r) => orderNos.includes(r.order_no)).map((r) => `${r.board}:${r.kind}:${r.order_no}:${r.box_seq ?? "-"}`);
}

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

/** 상자 n 개 주문 — 모두 입고·라벨 부착, 첫 상자를 크리에이터 확인으로 검수 완료(held). creatorId 를 주면 그 크리에이터에게 */
async function heldGift(n = 1, creatorId?: string): Promise<{ g: Unit; qrs: string[] }> {
  const g = await paidGift(n, creatorId);
  const op = await staff();
  const qrs: string[] = [];
  for (const boxId of g.boxIds) {
    const no = waybill();
    await fanSetsWaybill(boxId, no);
    qrs.push(await receiveAndLabel(op, no));
  }
  expect(await inspect(op, qrs[0]!, CONFIRM)).toBe("held");
  return { g, qrs };
}

const choose = async (login: string, orderNo: string, seq: number, choice: string) =>
  (await signedInClient(login)).rpc("choose_creator_check", { p_order_no: orderNo, p_box_seq: seq, p_choice: choice });
const cancel = async (login: string, orderNo: string, seq: number) =>
  (await signedInClient(login)).rpc("cancel_creator_check", { p_order_no: orderNo, p_box_seq: seq });
const processCheck = async (login: string, qr: string, seen: string) =>
  (await signedInClient(login)).rpc("office_process_creator_check", { p_qr: qr, p_seen_choice: seen });

const checkRow = (qr: string) =>
  psql(
    `select coalesce(k.choice, '-') || '|' || coalesce(k.answer, '-') || '|' || coalesce(k.answered_by::text, '-') from public.office_creator_checks k join public.office_parcels p on p.id = k.parcel_id where p.qr_code = '${qr}'`,
  );
const checkEvents = (qr: string) =>
  psql(
    `select coalesce(string_agg(e.action || ':' || coalesce(e.choice, '-'), ',' order by e.id), '') from public.office_creator_check_events e join public.office_parcels p on p.id = e.parcel_id where p.qr_code = '${qr}'`,
  );
const fanAlerts = (orderId: string, kind: string) =>
  psql(`select count(*) from public.notification_outbox n where n.order_id = '${orderId}' and n.kind = '${kind}' and n.account_id = '${SEED.fanId}' and n.channel = 'email'`);
const backdateInspected = (qr: string, interval: string) => psql(`update public.office_parcels set inspected_at = now() - interval '${interval}' where qr_code = '${qr}'`);
const backdateOrder = (orderId: string, interval: string) => psql(`update public.orders set registered_at = now() - interval '${interval}' where id = '${orderId}'`);

async function runExpiry(orderNo: string): Promise<{ held: number }> {
  const r = await (await staff()).rpc("office_run_expiry", { p_order_no: orderNo });
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.code} ${r.error.message}`);
  return r.data as { held: number };
}

/** 한 처리 안에서 검수 완료 시각을 now() − interval 로 두고 바로 그 크리에이터로 함수를 부른다 — 경계를 정확히 잰다 */
function atExactly(qr: string, interval: string, call: string, login = "haru_creator"): string {
  const uid = psql(`select id from public.profiles where login_id = '${login}'`);
  const out = psql(
    `begin; update public.office_parcels set inspected_at = now() - interval '${interval}' where qr_code = '${qr}'; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; select ${call}; commit;`,
  );
  return out.split("\n").filter((l) => !/^(BEGIN|SET|COMMIT|UPDATE \d+)$/.test(l)).join("|");
}

/** 다른 연결에서 잠금을 기다리는 요청이 n 개 이상 될 때까지 본다(최대 약 1.2초) — 동시 시험이 실제로 겹쳤는지 */
async function lockWaiters(n: number): Promise<boolean> {
  for (let i = 0; i < 24; i++) {
    if (Number(psql("select count(distinct pid) from pg_locks where not granted")) >= n) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

/** 한 처리 안에서 준비 문장(setup)을 실행하고 바로 그 계정으로 select 한다 — 읽는 순간의 now() 가 준비와 같아 경계를 정확히 잰다 */
function atMoment(setup: string, select: string, login = "haru_creator"): string {
  const uid = psql(`select id from public.profiles where login_id = '${login}'`);
  const out = psql(`begin; ${setup}; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${select}; commit;`);
  return out.split("\n").filter((l) => !/^(BEGIN|SET|COMMIT|UPDATE \d+|INSERT \d+ \d+)$/.test(l)).join("|");
}

// ── 역조공 ─────────────────────────────────────────

/** 보내기 하나(결제 완료) — 보낸 사람 sender, 받는 팬마다 몫 하나. 받는 팬은 보낸 크리에이터를 팔로우해 둔다(INV-R2) */
async function paidSend(fans: readonly { fanId: string; tier?: Tier }[], sender: "haru" | "momo" = "haru"): Promise<TestSend & { shareIds: string[] }> {
  const creatorId = sender === "haru" ? HARU_CREATOR_ID : MOMO_CREATOR_ID;
  for (const f of fans) followForTest(f.fanId, creatorId);
  const args = revgiftArgs(
    fans.map((f) => ({ fanId: f.fanId, tier: f.tier ?? "small" })),
    sender === "haru" ? PROFILE.haru : PROFILE.momo,
  );
  const reg = await adminClient().rpc("register_revgift", args);
  if (reg.error) throw new Error(`register_revgift 실패: ${reg.error.code} ${reg.error.message}`);
  const send: TestSend = { sendId: reg.data as string, tossOrderId: args.p_toss_order_id, orderNos: args.p_shares.map((s) => s.order_no) };
  const paid = await adminClient().rpc("settle_revgift_payment", { p_toss_order_id: send.tossOrderId, p_status: "done", p_payment_key: `pk_${send.tossOrderId}` });
  if (paid.error || paid.data !== true) throw new Error(`settle_revgift_payment 실패: ${paid.error?.message ?? paid.data}`);
  const shareIds = send.orderNos.map((no) => psql(`select id from public.revgift_shares where order_no = '${no}'`));
  return { ...send, shareIds };
}

/** 6자리 없이 온 상자를 보류로(보내는 분 이름은 아무 계정과도 맞지 않는 값) */
async function holdNoCode(barcode: string, carrier = "cj"): Promise<string> {
  const r = await scanInbound(await staff(), barcode, { code: null, carrier, senderName: "보낸사람없음", shelf: "T-AC" });
  expect((r.data as { result: string }).result).toBe("hold");
  return psql(`select id from public.office_unmatched where waybill_no = '${barcode}'`);
}

const findShare = async (login: string, shareId: string, no: string, carrier = "cj") =>
  (await signedInClient(login)).rpc("find_held_parcel", { p_box_id: null, p_share_id: shareId, p_waybill: no, p_carrier: carrier });

const shareParcel = (shareId: string) =>
  psql(`select coalesce((select state || '|' || coalesce(inbound_waybill_no, '') from public.office_parcels where share_id = '${shareId}' and state <> 'awaiting'), 'none')`);
const shareCode = (shareId: string) => psql(`select state from public.inbound_codes where share_id = '${shareId}'`);
const heldMatched = (unmatchedId: string) => psql(`select coalesce(matched_parcel_id::text, '-') from public.office_unmatched where id = '${unmatchedId}'`);

async function candidates(login: string): Promise<Record<string, unknown>[]> {
  const r = await (await signedInClient(login)).rpc("my_revgift_find_candidates");
  if (r.error) throw new Error(`my_revgift_find_candidates 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Record<string, unknown>[];
}

/** 몫 상자를 6자리로 입고(라벨 부착까지) */
async function receiveShareWithCode(shareId: string): Promise<string> {
  const op = await staff();
  const r = await scanInbound(op, waybill(), { code: codeOf({ shareId }) });
  expect((r.data as { result: string }).result).toBe("received");
  const qr = (r.data as { qr: string }).qr;
  expect((await op.rpc("office_confirm_label", { p_qr: qr })).error).toBeNull();
  return qr;
}

// ════════════════════════════════════════════════════════════════════════════════════

describe("INV-W13: 블루투스 상자의 크리에이터 답은 「선택」 — 고르기·취소는 운영자 처리 전·기한 전까지, 처리에서 잠긴다", () => {
  it("INV-W13 S13: 받기를 고르면 선택만 남고 상자는 확인 대기 그대로(출고 목록에 없다). 취소하면 다시 거절을 고를 수 있고 기록은 세 줄", async () => {
    const { g, qrs } = await heldGift();
    await approve(g);
    const r = await choose("haru_creator", g.orderNo, 1, "accept");
    expect(r.error).toBeNull();
    expect(r.data).toBe("chosen");
    expect(parcelState(qrs[0]!)).toBe("held");
    expect(checkRow(qrs[0]!)).toBe("accept|-|-");
    // 승인된 주문이어도 고르기만으로는 송장 출력 단계에 오르지 않는다
    expect(finishPrint(qrs[0]!, waybill())).not.toBeNull();
    expect((await cancel("haru_creator", g.orderNo, 1)).data).toBe("cancelled");
    expect(checkRow(qrs[0]!)).toBe("-|-|-");
    expect((await choose("haru_creator", g.orderNo, 1, "return")).data).toBe("chosen");
    expect(checkRow(qrs[0]!)).toBe("return|-|-");
    expect(parcelState(qrs[0]!)).toBe("held");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
    expect(checkEvents(qrs[0]!)).toBe("choose:accept,cancel:-,choose:return");
  });

  it("INV-W13 (실패경로): 고른 상태에서 또 고르면 「이미 고름」, 고른 것이 없는데 취소하면 「고른 것 없음」, 모르는 선택은 거부", async () => {
    const { g, qrs } = await heldGift();
    expect((await cancel("haru_creator", g.orderNo, 1)).data).toBe("not_chosen");
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    expect((await choose("haru_creator", g.orderNo, 1, "return")).data).toBe("already_chosen");
    expect((await choose("haru_creator", g.orderNo, 1, "maybe")).error?.code).toBe("22023");
    expect(checkRow(qrs[0]!)).toBe("accept|-|-");
  });

  it("INV-W13 S4i: 받기 선택을 운영자가 처리하면 검수 완료 — 주문 검수 결과 「통과」, 팬 알림 없음, 처리한 운영자는 기록에", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    expect(orderStatus(g.orderId)).toBe("labeled");
    const r = await processCheck("fankkuk_staff", qrs[0]!, "accept");
    expect(r.error).toBeNull();
    expect(r.data).toBe("accepted");
    expect(parcelState(qrs[0]!)).toBe("inspected");
    expect(checkRow(qrs[0]!)).toBe(`accept|accept|${psql("select id from public.profiles where login_id = 'fankkuk_staff'")}`);
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("passed");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
    await approve(g);
    expect(finishPrint(qrs[0]!, waybill())).toBeNull();
  });

  it("INV-W13 S4i: 거절 선택을 운영자(대표)가 처리하면 반송 대기 — 팬 「돌려보낼 상자」 1건, 주문 검수 결과 「반송」, 승인 전 주문은 더 승인할 수 없다", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "return")).data).toBe("chosen");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
    expect((await processCheck("fankkuk_admin", qrs[0]!, "return")).data).toBe("returned");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("returned");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("1");
    expect((await approveRpc(g.requestId)).data).toBe("not_approvable");
  });

  it("INV-W13 S13b (실패경로): 처리된 뒤의 취소·다시 고르기는 「이미 처리됨」, 고른 것 없는 상자의 처리는 「고른 것이 없음」, 남·팬의 취소는 「없음」, 크리에이터·손님은 처리 함수를 못 부른다", async () => {
    const { g, qrs } = await heldGift();
    expect((await processCheck("fankkuk_staff", qrs[0]!, "accept")).data).toBe("no_choice");
    expect(parcelState(qrs[0]!)).toBe("held");
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    for (const login of ["momo_creator", "byeolbit_fan"]) {
      expect([login, (await cancel(login, g.orderNo, 1)).data]).toEqual([login, "not_found"]);
      expect([login, (await choose(login, g.orderNo, 1, "return")).data]).toEqual([login, "not_found"]);
    }
    expect((await processCheck("haru_creator", qrs[0]!, "accept")).error?.code).toBe("42501");
    expect((await anonClient().rpc("office_process_creator_check", { p_qr: qrs[0], p_seen_choice: "accept" })).error?.code).toBe("42501");
    expect((await processCheck("fankkuk_staff", qrs[0]!, "accept")).data).toBe("accepted");
    expect((await cancel("haru_creator", g.orderNo, 1)).data).toBe("processed");
    expect((await choose("haru_creator", g.orderNo, 1, "return")).data).toBe("processed");
    expect((await processCheck("fankkuk_staff", qrs[0]!, "accept")).data).toBe("processed");
    expect(parcelState(qrs[0]!)).toBe("inspected");
  });

  it("INV-W13 S13c (실패경로): 운영자가 본 선택(받기)과 지금 선택(크리에이터가 취소 뒤 거절)이 다르면 「바뀜」 — 아무것도 바뀌지 않는다", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    expect((await cancel("haru_creator", g.orderNo, 1)).data).toBe("cancelled");
    expect((await choose("haru_creator", g.orderNo, 1, "return")).data).toBe("chosen");
    expect((await processCheck("fankkuk_staff", qrs[0]!, "accept")).data).toBe("changed");
    expect(parcelState(qrs[0]!)).toBe("held");
    expect(checkRow(qrs[0]!)).toBe("return|-|-");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
    expect((await processCheck("fankkuk_staff", qrs[0]!, "nope")).error?.code).toBe("22023");
  });

  it("INV-W13 S13d (동시): 받기 선택인 상자에 취소와 운영자 처리가 동시에 — 하나만 반영되고 둘 다 반영된 상태는 없다", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    const [haru, op] = [await signedInClient("haru_creator"), await staff()];
    // 상자 작업 줄을 쥐고 있는 동안 둘을 보내 확실히 겹치게 한다 — 놓이면 먼저 잡은 쪽이 이긴다
    const lock = await holdRowLock(`select 1 from public.office_parcels where qr_code = '${qrs[0]}' for update`, 1.5);
    const pending = Promise.all([
      haru.rpc("cancel_creator_check", { p_order_no: g.orderNo, p_box_seq: 1 }),
      op.rpc("office_process_creator_check", { p_qr: qrs[0], p_seen_choice: "accept" }),
    ]);
    // 둘 다 잠금을 기다리는지 먼저 본다 — 운 좋게 앞뒤로 와서 통과하지 않게
    expect(await lockWaiters(2)).toBe(true);
    const [c, p] = await pending;
    await lock.released;
    expect(c.error).toBeNull();
    expect(p.error).toBeNull();
    const outcome = `${String(c.data)}|${String(p.data)}`;
    expect(["cancelled|no_choice", "processed|accepted"]).toContain(outcome);
    if (outcome === "cancelled|no_choice") {
      expect(parcelState(qrs[0]!)).toBe("held");
      expect(checkRow(qrs[0]!)).toBe("-|-|-");
    } else {
      expect(parcelState(qrs[0]!)).toBe("inspected");
      expect(checkRow(qrs[0]!).startsWith("accept|accept|")).toBe(true);
    }
  });

  it("INV-W13 S13e: 거절을 고른 채 기한(검수 완료 + 168시간)이 지나면 자동 처리가 반송 대기로 — 팬 알림 1건, 처리한 사람 칸은 비어(자동), 두 번 돌려도 한 번. 그 뒤 취소는 「기한 지남」", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "return")).data).toBe("chosen");
    backdateInspected(qrs[0]!, "169 hours");
    expect((await runExpiry(g.orderNo)).held).toBe(1);
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkRow(qrs[0]!)).toBe("return|return|-");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("1");
    expect((await runExpiry(g.orderNo)).held).toBe(0);
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("1");
    expect((await cancel("haru_creator", g.orderNo, 1)).data).toBe("expired");
  });

  it("INV-W13 S13e: 받기를 고른 채 기한이 지나면 자동 처리가 검수 완료로 — 운영자를 기다리지 않는다, 팬 알림 없음", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    backdateInspected(qrs[0]!, "169 hours");
    expect((await runExpiry(g.orderNo)).held).toBe(1);
    expect(parcelState(qrs[0]!)).toBe("inspected");
    expect(checkRow(qrs[0]!)).toBe("accept|accept|-");
    expect(psql(`select inspection_result from public.orders where id = '${g.orderId}'`)).toBe("passed");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
  });

  it("INV-W13·W6 S4j: 고른 것 없이 167시간 59분이면 그대로·고르기를 받고, 정확히 168시간이면 고르기·취소 모두 「기한 지남」, 자동 처리는 반송 대기 + 「기한 지남」 + 팬 알림 1", async () => {
    const early = await heldGift();
    backdateInspected(early.qrs[0]!, "167 hours 59 minutes");
    expect((await runExpiry(early.g.orderNo)).held).toBe(0);
    expect((await choose("haru_creator", early.g.orderNo, 1, "accept")).data).toBe("chosen");

    const { g, qrs } = await heldGift();
    expect(atExactly(qrs[0]!, "168 hours", `public.choose_creator_check('${g.orderNo}', 1, 'accept')`)).toBe("expired");
    expect(atExactly(qrs[0]!, "168 hours", `public.cancel_creator_check('${g.orderNo}', 1)`)).toBe("expired");
    expect(checkRow(qrs[0]!)).toBe("-|-|-");
    backdateInspected(qrs[0]!, "169 hours");
    expect((await runExpiry(g.orderNo)).held).toBe(1);
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(checkRow(qrs[0]!)).toBe("-|expired|-");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("1");
  });

  it("INV-W13 (실패경로): 주문이 끝나면(거절) 고른 것이 있어도 질문은 닫히고 상자는 반송 대기 — 그 뒤 고르기·취소·처리는 「끝남」", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false })).error).toBeNull();
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect((await cancel("haru_creator", g.orderNo, 1)).data).toBe("closed");
    expect((await choose("haru_creator", g.orderNo, 1, "return")).data).toBe("closed");
    expect((await processCheck("fankkuk_staff", qrs[0]!, "accept")).data).toBe("closed");
    expect(fanAlerts(g.orderId, "hold_fan")).toBe("0");
  });

  it("INV-W13 (실패경로): 고르기·취소 기록은 추가만 — 고치거나 지울 수 없다. 바로 넘기던 옛 답하기 함수는 없다(새 처리 길 없음)", async () => {
    const { g, qrs } = await heldGift();
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    const id = psql(`select e.id from public.office_creator_check_events e join public.office_parcels p on p.id = e.parcel_id where p.qr_code = '${qrs[0]}'`);
    expect(() => psql(`update public.office_creator_check_events set choice = 'return' where id = ${id}`)).toThrow();
    expect(() => psql(`delete from public.office_creator_check_events where id = ${id}`)).toThrow();
    expect(psql(`select to_regprocedure('public.answer_creator_check(text, integer, text)') is null`)).toBe("t");
    // 옛 크리에이터 확인 목록 읽기도 없다 — 확인 대기 상자는 크리에이터 처리할 일 하나로만 읽는다(action-center INV-J6)
    expect(psql(`select to_regprocedure('public.my_creator_checks()') is null`)).toBe("t");
  });

  it("INV-W13: 운영자 목록 — 고른 것이 있고 처리 전인 상자만(QR·주문번호·상자·선택·기한), 크리에이터·팬에게는 0줄", async () => {
    const a = await heldGift();
    const b = await heldGift();
    expect((await choose("haru_creator", a.g.orderNo, 1, "return")).data).toBe("chosen");
    const rows = ((await (await staff()).rpc("admin_creator_check_choices")).data as Record<string, unknown>[]).filter((r) =>
      [a.g.orderNo, b.g.orderNo].includes(String(r.order_no)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qr: a.qrs[0], order_no: a.g.orderNo, box_seq: 1, choice: "return" });
    expect(Object.keys(rows[0]!).sort()).toEqual(["box_seq", "choice", "chosen_at", "due_at", "order_no", "qr"]);
    for (const login of ["haru_creator", "byeolbit_fan"]) {
      const other = (await (await signedInClient(login)).rpc("admin_creator_check_choices")).data as unknown[] | null;
      expect([login, (other ?? []).length]).toEqual([login, 0]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════

describe("INV-J5: 크리에이터 처리할 일 — 네 종류, 보이는 조건은 그 일을 받아 주는 처리와 같은 판정, 순서는 읽기 함수가", () => {
  it("INV-J5 S5: 확인 대기 2(하나는 받기 선택) · 승인 요청 3(남은 날 3·5·6) · 늦은 몫 1 → 받은 선물 5줄(블루투스 → 승인, 기한 짧은 순) · 보낸 선물 1줄", async () => {
    const bt1 = await heldGift();
    const bt2 = await heldGift();
    await approve(bt1.g);
    await approve(bt2.g);
    // 블루투스 둘의 기한을 다르게 — bt2 가 더 급하다
    backdateInspected(bt2.qrs[0]!, "50 hours");
    expect((await choose("haru_creator", bt1.g.orderNo, 1, "accept")).data).toBe("chosen");
    // 기대 순서와 거꾸로 만든다 — 만든 순서대로 나와도 통과하지 않게(기한이 긴 것부터)
    const r6 = await paidGift();
    const r5 = await paidGift();
    const r3 = await paidGift();
    backdateOrder(r3.orderId, "96 hours");
    backdateOrder(r5.orderId, "48 hours");
    backdateOrder(r6.orderId, "24 hours");
    // 보낸 선물 판: 결제가 이른 순(가장 오래 늦은 것부터) — 늦게 결제한 것을 먼저 만든다
    const late = await paidSend([{ fanId: PROFILE.byeolbit }]);
    backdateSettlement(late, 400);
    const older = await paidSend([{ fanId: PROFILE.byeolbit }]);
    backdateSettlement(older, 500);
    const mine = [bt1.g.orderNo, bt2.g.orderNo, r3.orderNo, r5.orderNo, r6.orderNo, late.orderNos[0]!, older.orderNos[0]!];
    expect(await lines("haru_creator", mine)).toEqual([
      `received:bluetooth:${bt2.g.orderNo}:1`,
      `received:bluetooth:${bt1.g.orderNo}:1`,
      `received:approval:${r3.orderNo}:-`,
      `received:approval:${r5.orderNo}:-`,
      `received:approval:${r6.orderNo}:-`,
      `sent:unconfirmed:${older.orderNos[0]}:-`,
      `sent:unconfirmed:${late.orderNos[0]}:-`,
    ]);
    const rows = (await items("haru_creator")).filter((r) => mine.includes(r.order_no));
    // 「받기 선택」 줄에는 고른 쪽이 함께 온다 — 화면이 고른 쪽과 「취소」를 그린다
    expect(rows.find((r) => r.order_no === bt1.g.orderNo)?.choice).toBe("accept");
    expect(rows.find((r) => r.order_no === bt2.g.orderNo)?.choice).toBeNull();
    // 블루투스 기한 = 검수 완료 + 168시간, 승인 기한 = 결제 완료 + 168시간
    const btDue = psql(`select extract(epoch from inspected_at + interval '168 hours') from public.office_parcels where qr_code = '${bt1.qrs[0]}'`);
    expect(Date.parse(String(rows.find((r) => r.order_no === bt1.g.orderNo)?.due_at)) / 1000).toBeCloseTo(Number(btDue), 2);
    const apDue = psql(`select extract(epoch from registered_at + interval '168 hours') from public.orders where id = '${r3.orderId}'`);
    expect(Date.parse(String(rows.find((r) => r.order_no === r3.orderNo)?.due_at)) / 1000).toBeCloseTo(Number(apDue), 2);
    expect(rows.find((r) => r.kind === "approval" && r.order_no === r3.orderNo)).toMatchObject({ request_id: r3.requestId, nickname: "별빛", box_count: 1 });
  });

  it("INV-J5 (2026-10-30, 카드 d1): 승인 요청은 결제 뒤 24시간 안인 새 요청을 최근 순으로 먼저, 그다음 밀린 요청을 오래된 순 — 23시간 59분은 새 요청, 24시간은 밀린 요청", async () => {
    // 기대 순서와 다르게 만든다
    const old48 = await paidGift();
    const new2 = await paidGift();
    const edge24 = await paidGift();
    const old96 = await paidGift();
    const new10 = await paidGift();
    const edge2359 = await paidGift();
    backdateOrder(old48.orderId, "48 hours");
    backdateOrder(new2.orderId, "2 hours");
    backdateOrder(edge24.orderId, "24 hours");
    backdateOrder(old96.orderId, "96 hours");
    backdateOrder(new10.orderId, "10 hours");
    backdateOrder(edge2359.orderId, "23 hours 59 minutes");
    const mine = [old48, new2, edge24, old96, new10, edge2359].map((g) => g.orderNo);
    expect(await lines("haru_creator", mine)).toEqual([
      `received:approval:${new2.orderNo}:-`,
      `received:approval:${new10.orderNo}:-`,
      `received:approval:${edge2359.orderNo}:-`,
      `received:approval:${old96.orderNo}:-`,
      `received:approval:${old48.orderNo}:-`,
      `received:approval:${edge24.orderNo}:-`,
    ]);
  });

  it("INV-J5 S5b (실패경로): 승인을 마친 요청 · 168시간이 지난 대기 요청 · 운영자가 처리한 확인 상자 · 확인 기한이 지난 상자 · 거절로 끝난 주문의 확인 상자 → 줄 없음", async () => {
    const approved = await paidGift();
    await approve(approved);
    const lapsed = await paidGift();
    backdateOrder(lapsed.orderId, "169 hours");
    const processed = await heldGift();
    await approve(processed.g);
    expect((await choose("haru_creator", processed.g.orderNo, 1, "accept")).data).toBe("chosen");
    expect((await processCheck("fankkuk_staff", processed.qrs[0]!, "accept")).data).toBe("accepted");
    const overdue = await heldGift();
    await approve(overdue.g);
    backdateInspected(overdue.qrs[0]!, "168 hours");
    const rejected = await heldGift();
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: rejected.g.requestId, p_block: false })).error).toBeNull();
    expect(await lines("haru_creator", [approved.orderNo, lapsed.orderNo, processed.g.orderNo, overdue.g.orderNo, rejected.g.orderNo])).toEqual([]);
  });

  it("INV-J5 S5c: 승인 요청 — 결제 뒤 167시간 59분이면 줄이 있고, 168시간이면 자동 반려 전이어도 없다(승인 함수도 그때부터 「기한 지남」)", async () => {
    const g = await paidGift();
    // 읽는 순간에 결제 시각을 고정한다 — 168시간 정각을 「아직 있음」으로 바꾸면(<) 빨간불
    const at = (interval: string) =>
      atMoment(`update public.orders set registered_at = now() - interval '${interval}' where id = '${g.orderId}'`, `select count(*) from public.my_creator_action_items() where order_no = '${g.orderNo}' and kind = 'approval'`);
    expect(at("167 hours 59 minutes")).toBe("1");
    expect(at("168 hours")).toBe("0");
    backdateOrder(g.orderId, "168 hours");
    expect(psql(`select status from public.approval_requests where request_id = '${g.requestId}'`)).toBe("waiting");
    expect((await approveRpc(g.requestId)).data).toBe("expired");
  });

  it("INV-J5: 승인 전 주문에 확인 대기 상자가 있으면 블루투스 줄과 승인 줄이 따로 있다(줄 하나 = 상자 하나 · 주문 하나)", async () => {
    const { g } = await heldGift(2);
    expect(await lines("haru_creator", [g.orderNo])).toEqual([`received:bluetooth:${g.orderNo}:1`, `received:approval:${g.orderNo}:-`]);
  });

  it("INV-J5·J11: 미확인 상자 줄 — 몫 결제 뒤 335시간 59분이면 없고 336시간이면 있다. 6자리로 입고되면 없다", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const no = s.orderNos[0]!;
    const at = (interval: string) =>
      atMoment(`update public.revgift_sends set settled_at = now() - interval '${interval}' where id = '${s.sendId}'`, `select count(*) from public.my_creator_action_items() where order_no = '${no}'`);
    expect(at("335 hours 59 minutes")).toBe("0");
    expect(at("336 hours")).toBe("1");
    backdateSettlement(s, 336, 1);
    expect(await lines("haru_creator", [no])).toEqual([`sent:unconfirmed:${no}:-`]);
    await receiveShareWithCode(s.shareIds[0]!);
    expect(await lines("haru_creator", [no])).toEqual([]);
  });

  it("INV-J5 (실패경로): 미확인 상자 줄 — 취소로 닫힌 몫·받지 않음 뒤 6자리가 무효가 된 몫은 없고, 받지 않음 뒤 6자리를 살려 둔 몫은 있다(찾기 후보와 같은 판정)", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    backdateSettlement(s, 400);
    const [kept, closed] = s.orderNos as [string, string];
    // 받지 않음(살려 둔 6자리)
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where order_no = '${kept}'`);
    expect(shareCode(s.shareIds[0]!)).toBe("valid");
    psql(`update public.revgift_shares set cancelled_at = now() where order_no = '${closed}'`);
    expect(await lines("haru_creator", [kept, closed])).toEqual([`sent:unconfirmed:${kept}:-`]);
    psql(`update public.inbound_codes set state = 'void', voided_at = now() where share_id = '${s.shareIds[0]}'`);
    expect(await lines("haru_creator", [kept, closed])).toEqual([]);
  });

  it("INV-J5: 보낸 팬 선물 — 하루가 모모에게 보낸 선물의 도착하지 않은 상자는 「보낸 선물」 판에, 팬 처리할 일과 같은 판정(336시간)", async () => {
    const o = await registerTestOrder(1, { senderId: PROFILE.haru, creatorId: MOMO_CREATOR_ID });
    const requestId = await payTestOrder(o);
    expect((await approveRpc(requestId)).data).toBe("approved");
    const at = (interval: string) =>
      atMoment(`update public.orders set registered_at = now() - interval '${interval}' where id = '${o.orderId}'`, `select count(*) from public.my_creator_action_items() where order_no = '${o.orderNo}'`);
    expect(at("335 hours 59 minutes")).toBe("0");
    expect(at("336 hours")).toBe("1");
    backdateOrder(o.orderId, "336 hours 1 minute");
    expect(await lines("haru_creator", [o.orderNo])).toEqual([`sent:missing_box:${o.orderNo}:1`]);
    // 팬 처리할 일 읽기와 같은 판정 — 같은 계정의 my_action_items 에도 같은 상자가 있다
    const fanSide = ((await (await signedInClient("haru_creator")).rpc("my_action_items")).data as { order_no: string; kind: string }[]).filter((r) => r.order_no === o.orderNo);
    expect(fanSide.map((r) => r.kind)).toEqual(["missing_box"]);
    // 받는 쪽 모모에게는 승인할 일이 끝나 줄이 없다
    expect(await lines("momo_creator", [o.orderNo])).toEqual([]);
  });
});

describe("INV-J7: 읽기 함수는 인자가 없고 로그인 토큰의 크리에이터 것만, 칸은 기존 읽기가 주는 칸을 넘지 않는다", () => {
  it("INV-J7 S7 (실패경로): 하루·모모 각자 승인 요청·확인 상자 → 하루에게는 하루 것만, 모모에게는 모모 것만. 팬·직원·대표·손님은 0줄", async () => {
    const haru = await heldGift(1);
    const momo = await heldGift(1, MOMO_CREATOR_ID);
    const mine = [haru.g.orderNo, momo.g.orderNo];
    expect(await lines("haru_creator", mine)).toEqual([`received:bluetooth:${haru.g.orderNo}:1`, `received:approval:${haru.g.orderNo}:-`]);
    expect(await lines("momo_creator", mine)).toEqual([`received:bluetooth:${momo.g.orderNo}:1`, `received:approval:${momo.g.orderNo}:-`]);
    for (const login of ["byeolbit_fan", "fankkuk_staff", "fankkuk_admin"]) {
      expect([login, (await items(login)).length]).toEqual([login, 0]);
    }
    const anon = await anonClient().rpc("my_creator_action_items");
    expect(anon.error?.code).toBe("42501");
    expect(psql(`select pg_get_function_identity_arguments('public.my_creator_action_items'::regproc)`)).toBe("");
    // 하루가 모모의 상자를 고르려 해도 없는 것과 같다
    expect((await choose("haru_creator", momo.g.orderNo, 1, "accept")).data).toBe("not_found");
  });

  it("INV-J7 S7 (실패경로): 줄의 칸은 정해진 것뿐 — 팬 실명·주소·연락처·로그인 아이디·선물 이름·메모·6자리·원 송장 바코드·운영자 칸이 없다", async () => {
    // 상자 둘 다 확인 대기로 — 하나를 운영자가 처리한 뒤에도 남은 줄·응답에 운영자 칸·아이디가 없는지 본다
    const { g, qrs } = await heldGift(2);
    expect(await inspect(await staff(), qrs[1]!, CONFIRM)).toBe("held");
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    expect((await processCheck("fankkuk_staff", qrs[0]!, "accept")).data).toBe("accepted");
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    backdateSettlement(s, 400);
    // 하루가 모모에게 보낸 선물의 도착하지 않은 상자(보낸 팬 선물) 줄도 같은 칸
    const o = await registerTestOrder(1, { senderId: PROFILE.haru, creatorId: MOMO_CREATOR_ID });
    expect((await approveRpc(await payTestOrder(o))).data).toBe("approved");
    backdateOrder(o.orderId, "400 hours");
    const rows = (await items("haru_creator")).filter((r) => [g.orderNo, s.orderNos[0], o.orderNo].includes(r.order_no));
    expect(rows.map((r) => r.kind).sort()).toEqual(["approval", "bluetooth", "missing_box", "unconfirmed"]);
    const allowed = [
      "amount_krw", "bluetooth", "board", "box_count", "box_id", "box_label", "box_seq", "choice", "due_at", "has_electronics_or_metal", "item_kind",
      "kind", "measured_tier", "nickname", "order_no", "prior_gift_count", "prior_passed_count", "prior_returned_count", "received_at", "request_id",
      "rf", "sent_at", "share_id", "tier",
    ];
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(allowed);
    const text = JSON.stringify(rows);
    const code = codeOf({ boxId: g.boxIds[0]! })!;
    const barcode = psql(`select inbound_waybill_no from public.office_parcels where qr_code = '${qrs[0]}'`);
    expect(text).not.toContain(code);
    expect(text).not.toContain(barcode);
    expect(text).not.toContain("byeolbit_fan");
    const staffId = psql("select id from public.profiles where login_id = 'fankkuk_staff'");
    expect(text).not.toContain(staffId);
    expect(text).not.toContain("fankkuk_staff");
  });

  it("INV-J7 S7b (실패경로): 주인이 정해지지 않은 보류 상자가 셋 있어도 늦지 않은 몫에는 미확인 상자 줄이 없다 — 줄은 몫이 늦은지로만 정해진다", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    for (let i = 0; i < 3; i++) await holdNoCode(waybill());
    expect(await lines("haru_creator", s.orderNos)).toEqual([]);
  });

  it("INV-J7 S7b: 팬 고르기 후보 — 로그인한 크리에이터가 보낸 결제 완료·입고 전·닫히지 않은 몫만, 칸은 몫 번호·받는 팬 닉네임·상자 크기뿐", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    followForTest(PROFILE.somsatang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang, tier: "medium" }, { fanId: PROFILE.somsatang }]);
    const [open, received, cancelled] = s.shareIds as [string, string, string];
    await receiveShareWithCode(received);
    psql(`update public.revgift_shares set cancelled_at = now() where id = '${cancelled}'`);
    const momo = await paidSend([{ fanId: PROFILE.byeolbit }], "momo");
    // 결제 대기 보내기의 몫
    const pendingArgs = revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("register_revgift", pendingArgs)).error).toBeNull();
    const pendingShare = psql(`select id from public.revgift_shares where order_no = '${pendingArgs.p_shares[0]!.order_no}'`);
    const mine = (await candidates("haru_creator")).filter((c) => [open, received, cancelled, momo.shareIds[0], pendingShare].includes(String(c.share_id)));
    expect(mine).toEqual([{ share_id: open, fan_nickname: "별빛", tier: "small" }]);
    expect((await candidates("momo_creator")).map((c) => c.share_id)).toContain(momo.shareIds[0]);
    for (const login of ["byeolbit_fan", "fankkuk_staff"]) expect([login, (await candidates(login)).length]).toEqual([login, 0]);
  });
});

describe("INV-J8: 줄의 버튼은 정해진 처리를 부르고, 처리가 끝나면 다음 읽기에서 그 줄이 없다", () => {
  it("INV-J8 S8: 승인 요청 줄 → 서명으로 승인하면 줄이 없고 승인 내역에 있다. 받지 않기도 같다", async () => {
    const a = await paidGift();
    const b = await paidGift();
    expect(await lines("haru_creator", [a.orderNo, b.orderNo])).toHaveLength(2);
    expect((await approveRpc(a.requestId)).data).toBe("approved");
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: b.requestId, p_block: false })).error).toBeNull();
    expect(await lines("haru_creator", [a.orderNo, b.orderNo])).toEqual([]);
    const decided = ((await (await signedInClient("haru_creator")).rpc("my_decided_requests")).data as { order_no: string; outcome: string }[]).filter((d) =>
      [a.orderNo, b.orderNo].includes(d.order_no),
    );
    expect(decided.map((d) => `${d.order_no}:${d.outcome}`).sort()).toEqual([`${a.orderNo}:approved`, `${b.orderNo}:declined`].sort());
  });

  it("INV-J8 S8: 블루투스 줄 → 「받기」를 골라도 줄이 남고(받기 선택), 운영자가 처리하면 다음 읽기에서 없다", async () => {
    const { g, qrs } = await heldGift();
    await approve(g);
    expect((await choose("haru_creator", g.orderNo, 1, "accept")).data).toBe("chosen");
    const row = (await items("haru_creator")).filter((r) => r.order_no === g.orderNo);
    expect(row.map((r) => `${r.kind}:${r.choice}`)).toEqual(["bluetooth:accept"]);
    expect((await processCheck("fankkuk_staff", qrs[0]!, "accept")).data).toBe("accepted");
    expect(await lines("haru_creator", [g.orderNo])).toEqual([]);
  });

  it("INV-J8 S8b (실패경로): 서명 없이 승인하는 길이 없다 — 크리에이터 세션으로 승인 함수를 부를 수 없다", async () => {
    const g = await paidGift();
    const haru = await signedInClient("haru_creator");
    const r = await haru.rpc("start_approval_sign", { p_actor_id: PROFILE.haru, p_request_id: g.requestId, p_method: "fake" });
    expect(r.error?.code).toBe("42501");
    const st = await haru.rpc("settle_approval_sign", {
      p_actor_id: PROFILE.haru,
      p_sign_request_id: "00000000-0000-4000-8000-000000000000",
      p_signed_plaintext: "x",
      p_signature: "x",
      p_signed_at: new Date().toISOString(),
      p_method: "fake",
    });
    expect(st.error?.code).toBe("42501");
    expect(await lines("haru_creator", [g.orderNo])).toEqual([`received:approval:${g.orderNo}:-`]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════

describe("INV-C4 ②-나: 크리에이터의 미확인 상자 찾기 — 송장번호·택배사 두 값 + 자기 입고 전 몫 하나, 한 번에", () => {
  it("INV-C4 S4c: 모카·라온·새벽달 몫이 입고 전, 6자리 없이 온 보류 상자 → 하루가 두 값과 모카 몫을 고르면 모카 몫 상자로 입고, 6자리 사용됨, 그 줄은 없어진다", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    followForTest(PROFILE.somsatang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }, { fanId: PROFILE.somsatang }]);
    backdateSettlement(s, 400);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    expect(await lines("haru_creator", s.orderNos)).toHaveLength(3);
    const r = await findShare("haru_creator", s.shareIds[0]!, barcode);
    expect(r.error).toBeNull();
    expect(r.data).toBe("matched");
    expect(shareParcel(s.shareIds[0]!)).toBe(`received|${barcode}`);
    expect(shareCode(s.shareIds[0]!)).toBe("used");
    expect(heldMatched(held)).not.toBe("-");
    // 같은 보내기라 결제 시각이 같다 — 순서는 몫 id 라 정렬해서 본다(C5)
    expect((await lines("haru_creator", s.orderNos)).sort()).toEqual([`sent:unconfirmed:${s.orderNos[1]}:-`, `sent:unconfirmed:${s.orderNos[2]}:-`].sort());
  });

  it("INV-C4 S4d (실패경로): 택배사·송장번호가 다르면 이어지지 않는다. 두 값이 맞아도 모모 몫·이미 입고된 몫·닫힌 몫·결제 대기 몫을 고르면 거부, 보류 그대로", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    followForTest(PROFILE.somsatang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }, { fanId: PROFILE.somsatang }]);
    const [open, received, closed] = s.shareIds as [string, string, string];
    await receiveShareWithCode(received);
    psql(`update public.revgift_shares set cancelled_at = now() where id = '${closed}'`);
    const momo = await paidSend([{ fanId: PROFILE.byeolbit }], "momo");
    const pendingArgs = revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("register_revgift", pendingArgs)).error).toBeNull();
    const pendingShare = psql(`select id from public.revgift_shares where order_no = '${pendingArgs.p_shares[0]!.order_no}'`);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    expect((await findShare("haru_creator", open, barcode, "hanjin")).data).toBe("not_found");
    expect((await findShare("haru_creator", open, waybill())).data).toBe("not_found");
    // 하루 다섯 번 한도와 따로 보려고 여기서 시도 기록을 비운다
    psql("delete from public.office_match_attempts");
    for (const share of [momo.shareIds[0]!, received, closed, pendingShare]) {
      expect([share, (await findShare("haru_creator", share, barcode)).data]).toEqual([share, "not_found"]);
    }
    expect(heldMatched(held)).toBe("-");
    expect(shareParcel(open)).toBe("none");
    // 두 값은 맞았지만 후보가 아닌 몫을 고른 넷도 틀린 시도로 센다(INV-C10) — 한 번 더 틀리면 다섯, 그다음은 값이 맞아도 거부
    expect((await findShare("haru_creator", open, waybill())).data).toBe("not_found");
    expect((await findShare("haru_creator", open, barcode)).error?.code).toBe("P0045");
  });

  it("INV-C4 S4d: 모모가 같은 두 값을 넣고 자기 입고 전 몫을 고르면 이어진다 — 「남는 빈틈」(송장번호가 새면 다른 크리에이터가 가져갈 수 있다)", async () => {
    const momo = await paidSend([{ fanId: PROFILE.byeolbit }], "momo");
    const barcode = waybill();
    await holdNoCode(barcode);
    expect((await findShare("momo_creator", momo.shareIds[0]!, barcode)).data).toBe("matched");
  });

  it("INV-C4 S4f: 받지 않음 뒤 6자리를 살려 둔 몫(입고 전)도 후보 — 두 값이 맞으면 그 몫 상자로 입고되고 나갈 수 없는 상자다(반송으로 간다)", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where id = '${s.shareIds[0]}'`);
    expect(shareCode(s.shareIds[0]!)).toBe("valid");
    const barcode = waybill();
    await holdNoCode(barcode);
    expect((await findShare("haru_creator", s.shareIds[0]!, barcode)).data).toBe("matched");
    expect(shareCode(s.shareIds[0]!)).toBe("used");
    expect(psql(`select public.office_parcel_dead(p) from public.office_parcels p where p.share_id = '${s.shareIds[0]}'`)).toBe("t");
  });

  it("INV-C4 S4e (동시): 같은 보류 상자에 하루의 찾기 둘이 서로 다른 몫으로 동시에 → 한 몫에만 입고되고 다른 쪽은 「없음」", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    const haru = await signedInClient("haru_creator");
    const lock = await holdRowLock(`select 1 from public.office_unmatched where id = '${held}' for update`, 1.5);
    const pending = Promise.all(
      s.shareIds.map((id) => haru.rpc("find_held_parcel", { p_box_id: null, p_share_id: id, p_waybill: barcode, p_carrier: "cj" })),
    );
    expect(await lockWaiters(2)).toBe(true);
    const results = await pending;
    await lock.released;
    expect(results.map((r) => r.error)).toEqual([null, null]);
    expect(results.map((r) => r.data).sort()).toEqual(["matched", "not_found"]);
    expect(s.shareIds.map(shareParcel).filter((p) => p !== "none")).toEqual([`received|${barcode}`]);
  });

  it("INV-C4 S4e (동시): 하루의 찾기와 운영자의 반송 넘기기가 동시에 → 하나만 반영", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    const [haru, owner] = [await signedInClient("haru_creator"), await signedInClient("fankkuk_admin")];
    const lock = await holdRowLock(`select 1 from public.office_unmatched where id = '${held}' for update`, 1.5);
    const pending = Promise.all([
      haru.rpc("find_held_parcel", { p_box_id: null, p_share_id: s.shareIds[0], p_waybill: barcode, p_carrier: "cj" }),
      owner.rpc("admin_return_unmatched", { p_id: held }),
    ]);
    expect(await lockWaiters(2)).toBe(true);
    const [f, ret] = await pending;
    await lock.released;
    const matched = f.data === "matched";
    const returned = ret.error === null;
    expect([matched, returned].filter(Boolean)).toHaveLength(1);
    expect(psql(`select (matched_parcel_id is not null)::text || '|' || (expired_at is not null)::text from public.office_unmatched where id = '${held}'`)).toBe(
      matched ? "true|false" : "false|true",
    );
  });

  it("INV-C10 S10b: 하루가 상자 셋을 6자리 없이 보냄, 오늘 틀린 찾기 4번 → 맞는 찾기 3번은 모두 이어지고(세지 않음), 그 뒤 틀린 1번은 받고 그다음은 거부", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    followForTest(PROFILE.somsatang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }, { fanId: PROFILE.somsatang }]);
    const barcodes = [waybill(), waybill(), waybill()];
    for (const b of barcodes) await holdNoCode(b);
    for (let i = 0; i < 4; i++) expect((await findShare("haru_creator", s.shareIds[0]!, waybill())).data).toBe("not_found");
    for (let i = 0; i < 3; i++) expect((await findShare("haru_creator", s.shareIds[i]!, barcodes[i]!)).data).toBe("matched");
    followForTest(PROFILE.daltokki, HARU_CREATOR_ID);
    const more = await paidSend([{ fanId: PROFILE.daltokki }]);
    expect((await findShare("haru_creator", more.shareIds[0]!, waybill())).data).toBe("not_found");
    expect((await findShare("haru_creator", more.shareIds[0]!, waybill())).error?.code).toBe("P0045");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════

describe("INV-C11: 운영자 몫 옮기기 — ②-나 로 이어진 검수 완료 전 상자를 같은 크리에이터의 다른 후보 몫으로", () => {
  async function linkedToFirst(): Promise<{ s: TestSend & { shareIds: string[] }; held: string; barcode: string }> {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    expect((await findShare("haru_creator", s.shareIds[0]!, barcode)).data).toBe("matched");
    return { s, held, barcode };
  }
  const move = async (login: string, held: string, shareId: string) => (await signedInClient(login)).rpc("admin_move_held_share", { p_id: held, p_share_id: shareId });
  const moveLogs = (held: string) =>
    psql(
      `select coalesce(string_agg(f.order_no || '>' || t.order_no || '|' || p.login_id, ','), '') from public.office_share_moves m join public.revgift_shares f on f.id = m.from_share_id join public.revgift_shares t on t.id = m.to_share_id join public.profiles p on p.id = m.moved_by where m.unmatched_id = '${held}'`,
    );

  it("INV-C11 S11: 모카 몫으로 이은 상자(입고, 검수 전)를 운영자가 별이 몫으로 옮김 → 상자는 별이 몫, 별이 6자리 사용됨, 모카 몫은 입고 전·6자리 다시 유효, 기록 1줄", async () => {
    const { s, held, barcode } = await linkedToFirst();
    const [moka, byeori] = s.shareIds as [string, string];
    const r = await move("fankkuk_staff", held, byeori);
    expect(r.error).toBeNull();
    expect(r.data).toBe("moved");
    expect(shareParcel(byeori)).toBe(`received|${barcode}`);
    expect(shareParcel(moka)).toBe("none");
    expect(shareCode(byeori)).toBe("used");
    expect(shareCode(moka)).toBe("valid");
    expect(psql(`select coalesce(received_at::text, '-') from public.revgift_shares where id = '${moka}'`)).toBe("-");
    expect(psql(`select received_at is not null from public.revgift_shares where id = '${byeori}'`)).toBe("t");
    expect(moveLogs(held)).toBe(`${s.orderNos[0]}>${s.orderNos[1]}|fankkuk_staff`);
    // 모카 몫은 다시 후보·미확인 줄 판정 대상이다
    expect((await candidates("haru_creator")).map((c) => c.share_id)).toContain(moka);
    expect(() => psql(`delete from public.office_share_moves where unmatched_id = '${held}'`)).toThrow();
  });

  it("INV-C11 (실패경로): 사용된 6자리를 다시 유효로 돌리는 것은 옮기기 처리 안에서만 — 표를 직접 고치면 6자리 지킴이가 거부한다", async () => {
    const { s } = await linkedToFirst();
    expect(shareCode(s.shareIds[0]!)).toBe("used");
    expect(() => psql(`update public.inbound_codes set state = 'valid', used_at = null where share_id = '${s.shareIds[0]}'`)).toThrow();
    expect(shareCode(s.shareIds[0]!)).toBe("used");
  });

  it("INV-C11 S11b (실패경로): 다른 크리에이터의 몫·이미 입고된 몫으로는 「후보 아님」, 변화 없음", async () => {
    const { s, held, barcode } = await linkedToFirst();
    const momo = await paidSend([{ fanId: PROFILE.byeolbit }], "momo");
    expect((await move("fankkuk_staff", held, momo.shareIds[0]!)).error?.code).toBe("P0047");
    await receiveShareWithCode(s.shareIds[1]!);
    expect((await move("fankkuk_staff", held, s.shareIds[1]!)).error?.code).toBe("P0047");
    expect(shareParcel(s.shareIds[0]!)).toBe(`received|${barcode}`);
    expect(shareCode(s.shareIds[0]!)).toBe("used");
  });

  it("INV-C11 S11b (실패경로): 검수 완료 뒤의 상자는 옮기지 않는다(55000)", async () => {
    const { s, held } = await linkedToFirst();
    const op = await staff();
    const qr = psql(`select qr_code from public.office_parcels where share_id = '${s.shareIds[0]}'`);
    psql(`update public.office_parcels set state = 'labeled', labeled_at = now() where qr_code = '${qr}'`);
    expect(await inspect(op, qr, SHARE_PASS)).toBe("inspected");
    expect((await move("fankkuk_admin", held, s.shareIds[1]!)).error?.code).toBe("55000");
    expect(shareParcel(s.shareIds[0]!).startsWith("inspected|")).toBe(true);
  });

  it("INV-C11 S11b (실패경로): 팬·크리에이터·손님은 옮길 수 없다(42501)", async () => {
    const { s, held } = await linkedToFirst();
    for (const login of ["haru_creator", "byeolbit_fan"]) expect([login, (await move(login, held, s.shareIds[1]!)).error?.code]).toEqual([login, "42501"]);
    expect((await anonClient().rpc("admin_move_held_share", { p_id: held, p_share_id: s.shareIds[1] })).error?.code).toBe("42501");
    expect(shareParcel(s.shareIds[1]!)).toBe("none");
  });

  it("INV-C11: 옮길 곳 후보 읽기 — 그 상자를 이은 크리에이터의 결제 완료·입고 전 몫만, 운영자에게만", async () => {
    const { s, held } = await linkedToFirst();
    await paidSend([{ fanId: PROFILE.byeolbit }], "momo");
    const rows = (await (await staff()).rpc("admin_share_move_candidates", { p_id: held })).data as Record<string, unknown>[];
    expect(rows.map((r) => r.share_id)).toEqual([s.shareIds[1]]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["fan_nickname", "order_no", "share_id", "tier"]);
    expect(((await (await signedInClient("haru_creator")).rpc("admin_share_move_candidates", { p_id: held })).data as unknown[]).length).toBe(0);
  });

  it("INV-C11 (동시): 옮기기와 그 몫의 찾기(다른 보류 상자)가 동시에 → 그 몫에는 상자 하나만", async () => {
    const { s, held } = await linkedToFirst();
    const target = s.shareIds[1]!;
    const other = waybill();
    await holdNoCode(other);
    const [op, haru] = [await staff(), await signedInClient("haru_creator")];
    const lock = await holdRowLock(`select 1 from public.revgift_shares where id = '${target}' for update`, 1.5);
    const pending = Promise.all([
      op.rpc("admin_move_held_share", { p_id: held, p_share_id: target }),
      haru.rpc("find_held_parcel", { p_box_id: null, p_share_id: target, p_waybill: other, p_carrier: "cj" }),
    ]);
    expect(await lockWaiters(2)).toBe(true);
    const [m, f] = await pending;
    await lock.released;
    const moved = m.error === null && m.data === "moved";
    const found = f.data === "matched";
    expect([moved, found].filter(Boolean)).toHaveLength(1);
    expect(psql(`select count(*) from public.office_parcels where share_id = '${target}' and state <> 'awaiting'`)).toBe("1");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════

describe("INV-N20: 역조공 받기 알림 — 몫 결제 완료 때 받는 팬에게 한 번, 72시간 뒤 아직 받기 대기면 한 번 더, 끌 수 없음", () => {
  const offers = (shareId: string, round?: number) =>
    Number(
      psql(
        `select count(*) from public.notification_outbox where kind = 'revgift_offer' and share_id = '${shareId}' and channel = 'email'${round ? ` and round = ${round}` : ""}`,
      ),
    );

  it("INV-N20 S20: 하루가 별빛·구름빵에게 보낸 역조공 결제 완료 → 각자 줄 1개(받는 팬 계정), 하루에게는 0개. 꼭 가는 알림이다", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    expect(s.shareIds.map((id) => offers(id, 1))).toEqual([1, 1]);
    expect(psql(`select string_agg(account_id::text, ',' order by account_id) from public.notification_outbox where kind = 'revgift_offer' and share_id in ('${s.shareIds.join("','")}') and channel = 'email'`)).toBe(
      [PROFILE.byeolbit, PROFILE.gureumppang].sort().join(","),
    );
    expect(psql(`select count(*) from public.notification_outbox where kind = 'revgift_offer' and account_id = '${PROFILE.haru}' and share_id in ('${s.shareIds.join("','")}')`)).toBe("0");
    expect(psql(`select public.notification_kind_must_deliver('revgift_offer')`)).toBe("t");
  });

  it("INV-N20 S20b: 결제 + 72시간, 별빛 몫은 받기 대기·구름빵 몫은 받기 → 재알림은 별빛에게만 1개(두 번 돌려도 1개). 71시간 59분이면 없음", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    psql(`update public.revgift_shares set reply = 'accepted', replied_at = now() where id = '${s.shareIds[1]}'`);
    // 부르는 순간에 결제 시각을 고정한다 — 72시간 정각을 「아직」으로 바꾸면(<) 빨간불
    const at = (interval: string) =>
      psql(`begin; update public.revgift_sends set settled_at = now() - interval '${interval}' where id = '${s.sendId}'; select public.notification_enqueue_due(); commit;`);
    at("71 hours 59 minutes");
    expect(s.shareIds.map((id) => offers(id, 2))).toEqual([0, 0]);
    at("72 hours");
    expect(s.shareIds.map((id) => offers(id, 2))).toEqual([1, 0]);
    await adminClient().rpc("notification_enqueue_due");
    await adminClient().rpc("notification_enqueue_due");
    expect(s.shareIds.map((id) => offers(id, 2))).toEqual([1, 0]);
  });

  it("INV-N20 S20c (실패경로): 재알림 줄이 대기인 사이에 별빛이 받지 않기 → 꺼낼 때 건너뜀. 결제 대기로 닫힌 보내기의 몫에는 줄이 없다", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const id = psql(`select id from public.notification_outbox where kind = 'revgift_offer' and share_id = '${s.shareIds[0]}' and channel = 'email'`);
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where id = '${s.shareIds[0]}'`);
    psql(`update public.notification_outbox set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`);
    const claimed = (await adminClient().rpc("notification_claim", { p_limit: 1 })).data as unknown[];
    expect(claimed).toEqual([]);
    expect(psql(`select status || '|' || error_code from public.notification_outbox where id = '${id}'`)).toBe("skipped|share_not_waiting");
    const pendingArgs = revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("register_revgift", pendingArgs)).error).toBeNull();
    const pendingShare = psql(`select id from public.revgift_shares where order_no = '${pendingArgs.p_shares[0]!.order_no}'`);
    expect(offers(pendingShare)).toBe(0);
  });

  it("INV-N20: 꺼낸 줄에는 몫 주문번호와 보낸 크리에이터 이름뿐 — 상자 크기·금액·주소·6자리 칸이 없다", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const id = psql(`select id from public.notification_outbox where kind = 'revgift_offer' and share_id = '${s.shareIds[0]}' and channel = 'email'`);
    psql(`update public.notification_outbox set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`);
    const rows = (await adminClient().rpc("notification_claim", { p_limit: 1 })).data as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "revgift_offer", order_no: s.orderNos[0], sender_name: "하루", round: 1, must_deliver: true });
    const text = JSON.stringify(rows[0]);
    expect(text).not.toContain(codeOf({ shareId: s.shareIds[0]! })!);
    expect(text).not.toMatch(/small|5400|amount/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════
// 2026-10-16 리뷰 반영

describe("리뷰 반영 — 경계·잠금·남은 길", () => {
  it("INV-J5 S5b: 블루투스 줄은 읽는 순간 검수 완료 + 167시간 59분이면 있고 168시간 정각이면 없다", async () => {
    const { g, qrs } = await heldGift();
    await approve(g);
    const at = (interval: string) =>
      atMoment(
        `update public.office_parcels set inspected_at = now() - interval '${interval}' where qr_code = '${qrs[0]}'`,
        `select count(*) from public.my_creator_action_items() where order_no = '${g.orderNo}' and kind = 'bluetooth'`,
      );
    expect(at("167 hours 59 minutes")).toBe("1");
    expect(at("168 hours")).toBe("0");
  });

  it("INV-W13 (실패경로): 운영자 처리도 기한(검수 완료 + 168시간) 정각부터 「기한 지남」 — 167시간 59분이면 처리된다", async () => {
    const early = await heldGift();
    expect((await choose("haru_creator", early.g.orderNo, 1, "accept")).data).toBe("chosen");
    expect(atExactly(early.qrs[0]!, "167 hours 59 minutes", `public.office_process_creator_check('${early.qrs[0]}', 'accept')`, "fankkuk_staff")).toBe("accepted");
    const late = await heldGift();
    expect((await choose("haru_creator", late.g.orderNo, 1, "return")).data).toBe("chosen");
    expect(atExactly(late.qrs[0]!, "168 hours", `public.office_process_creator_check('${late.qrs[0]}', 'return')`, "fankkuk_staff")).toBe("expired");
    expect(parcelState(late.qrs[0]!)).toBe("held");
    expect(checkRow(late.qrs[0]!)).toBe("return|-|-");
    expect(fanAlerts(late.g.orderId, "hold_fan")).toBe("0");
  });

  it("INV-C11 (실패경로): 받지 않음·기한 지남 몫에서 옮기면 원래 몫의 6자리는 다시 유효가 되지 않는다(닫힌 몫)", async () => {
    for (const reply of ["declined", "expired"] as const) {
      followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
      const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
      psql(`update public.revgift_shares set reply = '${reply}', replied_at = now() where id = '${s.shareIds[0]}'`);
      const barcode = waybill();
      const held = await holdNoCode(barcode);
      expect((await findShare("haru_creator", s.shareIds[0]!, barcode)).data).toBe("matched");
      expect(shareCode(s.shareIds[0]!)).toBe("used");
      expect((await (await staff()).rpc("admin_move_held_share", { p_id: held, p_share_id: s.shareIds[1] })).data).toBe("moved");
      expect([reply, shareCode(s.shareIds[0]!)]).toEqual([reply, "used"]);
      expect(shareCode(s.shareIds[1]!)).toBe("used");
      psql("delete from public.office_match_attempts");
    }
  });

  it("INV-C11 (실패경로): 6자리가 붙어 온 보류 상자는 옮기지 않는다(55000)", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    expect((await findShare("haru_creator", s.shareIds[0]!, barcode)).data).toBe("matched");
    // 붙어 온 6자리가 있는 보류 줄로 만든다(분쟁·무효 6자리 갈래)
    psql(`update public.office_unmatched set code_id = (select id from public.inbound_codes where share_id = '${s.shareIds[0]}') where id = '${held}'`);
    expect((await (await staff()).rpc("admin_move_held_share", { p_id: held, p_share_id: s.shareIds[1] })).error?.code).toBe("55000");
    expect(shareParcel(s.shareIds[1]!)).toBe("none");
  });

  it("INV-J6: 승인 요청만 따로 세던 옛 읽기 함수는 없다", () => {
    expect(psql(`select to_regprocedure('public.my_approval_requests()') is null`)).toBe("t");
  });

  it("INV-J11: 미확인 상자 줄은 늦음 판정 함수와 같은 결과 — 하루가 보낸 몫 전부에서 판정이 참인 것만 줄이 있다", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const a = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    backdateSettlement(a, 400);
    await receiveShareWithCode(a.shareIds[1]!);
    const b = await paidSend([{ fanId: PROFILE.byeolbit }]);
    backdateSettlement(b, 100);
    const pending = revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("register_revgift", pending)).error).toBeNull();
    const mine = [...a.orderNos, ...b.orderNos, pending.p_shares[0]!.order_no];
    const expected = psql(
      `select coalesce(string_agg(s.order_no, ',' order by s.order_no), '') from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.sender_id = '${PROFILE.haru}' and s.order_no in ('${mine.join("','")}') and public.revgift_share_late(s.id, d.sender_id)`,
    );
    expect(expected).toBe(a.orderNos[0]);
    const got = (await items("haru_creator")).filter((r) => r.kind === "unconfirmed" && mine.includes(r.order_no)).map((r) => r.order_no).sort().join(",");
    expect(got).toBe(expected);
  });

  it("INV-J8 S8b (실패경로): 미확인 상자 줄이 있는 상태에서 송장번호가 틀린 찾기 → 아무것도 바뀌지 않고 줄이 남는다", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    backdateSettlement(s, 400);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    expect(await lines("haru_creator", s.orderNos)).toEqual([`sent:unconfirmed:${s.orderNos[0]}:-`]);
    expect((await findShare("haru_creator", s.shareIds[0]!, waybill())).data).toBe("not_found");
    expect(heldMatched(held)).toBe("-");
    expect(await lines("haru_creator", s.orderNos)).toEqual([`sent:unconfirmed:${s.orderNos[0]}:-`]);
  });
});

describe("리뷰 반영 — 운영자 목록의 옮기기 가능 표시 (INV-C11)", () => {
  const movable = async (held: string) =>
    ((await (await staff()).rpc("admin_unmatched_parcels")).data as { id: string; share_movable: boolean }[]).find((r) => r.id === held)?.share_movable;

  it("INV-C11: 찾기(②-나)로 이은 6자리 없는 역조공 상자·검수 전만 옮길 수 있다고 표시 — 이어지기 전·검수 뒤·6자리 붙은 줄은 아니다", async () => {
    followForTest(PROFILE.gureumppang, HARU_CREATOR_ID);
    const s = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.gureumppang }]);
    const barcode = waybill();
    const held = await holdNoCode(barcode);
    expect(await movable(held)).toBe(false);
    expect((await findShare("haru_creator", s.shareIds[0]!, barcode)).data).toBe("matched");
    expect(await movable(held)).toBe(true);
    psql(`update public.office_unmatched set code_id = (select id from public.inbound_codes where share_id = '${s.shareIds[0]}') where id = '${held}'`);
    expect(await movable(held)).toBe(false);
    psql(`update public.office_unmatched set code_id = null where id = '${held}'`);
    const qr = psql(`select qr_code from public.office_parcels where share_id = '${s.shareIds[0]}'`);
    psql(`update public.office_parcels set state = 'labeled', labeled_at = now() where qr_code = '${qr}'`);
    expect(await inspect(await staff(), qr, SHARE_PASS)).toBe("inspected");
    expect(await movable(held)).toBe(false);
  });

  it("INV-C11 (실패경로): 팬 선물 상자를 이은 보류 줄은 옮기기 대상이 아니다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    const r = await scanInbound(await staff(), barcode, { code: null, carrier: "cj", senderName: "별빛", shelf: "T-AC" });
    expect((r.data as { result: string }).result).toBe("hold");
    const held = psql(`select id from public.office_unmatched where waybill_no = '${barcode}'`);
    expect((await (await signedInClient("byeolbit_fan")).rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: barcode, p_carrier: "cj" })).data).toBe("matched");
    expect(await movable(held)).toBe(false);
  });
});

describe("INV-N21 (카드 d96 ③): 받는 주소 없이 보낸 상자 알림 — 크리에이터에게도, 팬 선물 주문이 있으면 그쪽 하나만", () => {
  /** 6자리 없이 온 상자를 보류로 — 송장 「보내는 분」 이름이 하루(크리에이터 닉네임)와 맞는다 */
  async function holdForHaru(): Promise<string> {
    const barcode = waybill();
    const r = await scanInbound(await staff(), barcode, { code: null, carrier: "cj", senderName: "하루", shelf: "T-AC" });
    expect((r.data as { result: string }).result).toBe("hold");
    return psql(`select id from public.office_unmatched where waybill_no = '${barcode}'`);
  }
  const alerts = (held: string) =>
    psql(
      `select coalesce(string_agg(coalesce(o.order_no, '-') || '|' || coalesce(s.order_no, '-') || '|' || n.channel, ','), '') from public.notification_outbox n left join public.orders o on o.id = n.order_id left join public.revgift_shares s on s.id = n.share_id where n.kind = 'box_no_code' and n.unmatched_id = '${held}' and n.account_id = '${PROFILE.haru}'`,
    );

  it("INV-N21 S21: 하루에게 결제 끝·입고 전 역조공 몫만 있으면 하루에게 한 번 — 그 몫을 가리키고(보낸 역조공 화면으로), 같은 바코드를 다시 찍어도 한 번", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const held = await holdForHaru();
    expect(alerts(held)).toBe(`-|${s.orderNos[0]}|email`);
    const barcode = psql(`select waybill_no from public.office_unmatched where id = '${held}'`);
    await scanInbound(await staff(), barcode, { code: null, carrier: "cj", senderName: "하루", shelf: "T-AC" });
    expect(alerts(held)).toBe(`-|${s.orderNos[0]}|email`);
    // 꺼낸 줄의 주문번호는 그 몫 번호 — 본문 틀이 보낸 역조공 화면으로 잇는다
    const id = psql(`select id from public.notification_outbox where kind = 'box_no_code' and unmatched_id = '${held}' and channel = 'email'`);
    psql(`update public.notification_outbox set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`);
    const rows = (await adminClient().rpc("notification_claim", { p_limit: 1 })).data as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ kind: "box_no_code", order_no: s.orderNos[0], must_deliver: true });
  });

  it("INV-N21 S21b: 하루에게 팬 선물 주문(모모에게 보낸 결제 끝·입고 전)도 있으면 팬 선물 쪽 하나만", async () => {
    await paidSend([{ fanId: PROFILE.byeolbit }]);
    const o = await registerTestOrder(1, { senderId: PROFILE.haru, creatorId: MOMO_CREATOR_ID });
    await payTestOrder(o);
    const held = await holdForHaru();
    expect(alerts(held)).toBe(`${o.orderNo}|-|email`);
  });

  it("INV-N21 S21c (실패경로): 결제 끝·입고 전인 몫도 주문도 없으면 알림이 없다 — 이미 입고된 몫·결제 대기 보내기만", async () => {
    const s = await paidSend([{ fanId: PROFILE.byeolbit }]);
    await receiveShareWithCode(s.shareIds[0]!);
    const pending = revgiftArgs([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("register_revgift", pending)).error).toBeNull();
    const held = await holdForHaru();
    expect(alerts(held)).toBe("");
  });
});
