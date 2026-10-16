import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { parseCreatorActionItems } from "@/entities/action-item/model/creator-action-items";
import { parseGiftProgressRows } from "@/widgets/creator-gift-progress/model/gift-progress";
import { actionTargetsOf, hasActionButton } from "@/widgets/creator-gift-progress/model/action-targets";
import { adminClient, anonClient, deleteTestOrders, followForTest, psql, registerTestOrder, signedInClient } from "./helpers";
import { approve, codeOf, deleteTestUnmatched, FAN_PASS, fanSetsWaybill, finishPrint, inspect, paidGift, receiveAndLabel, scanInbound, waybill, type Unit } from "./office-helpers";
import { closeKeptShares, deleteTestRevgifts, HARU_CREATOR_ID, PROFILE, registerTestRevgift, revgiftArgs, type TestSend, type Tier } from "./revgift-helpers";

// 크리에이터 선물 현황 (action-center INV-J9~J11, S9~S11b) — DB 읽기 함수 my_gift_progress.
// 시드: 하루(haru_creator)·모모(momo_creator) = 크리에이터, 별빛·달토끼·구름빵·솜사탕 = 팬, fankkuk_staff = 직원, fankkuk_admin = 대표.
// 읽기 결과는 시드 주문이 섞일 수 있어 이 시험이 만든 주문(몫)번호로 거른다(남의 것이 섞였는지는 거르지 않고 본다).

const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const FANS = [PROFILE.byeolbit, PROFILE.daltokki, PROFILE.gureumppang, PROFILE.somsatang] as const;
const CONFIRM = { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" } as const;

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

type Row = Record<string, unknown> & { board: string; order_no: string };

async function progress(login: string): Promise<Row[]> {
  const r = await (await signedInClient(login)).rpc("my_gift_progress");
  if (r.error) throw new Error(`my_gift_progress 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Row[];
}

const mine = (rows: readonly Row[], nos: readonly string[]) => rows.filter((r) => nos.includes(r.order_no));

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

/** 보내기 하나(결제 완료) — 받는 팬마다 몫 하나. 받는 팬은 보낸 크리에이터를 팔로우해 둔다(INV-R2) */
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

const backdateSend = (sendId: string, interval: string) => psql(`update public.revgift_sends set settled_at = now() - interval '${interval}' where id = '${sendId}'`);

/** 몫 상자를 6자리로 입고(라벨 부착까지) */
async function receiveShareWithCode(shareId: string): Promise<string> {
  const op = await staff();
  const r = await scanInbound(op, waybill(), { code: codeOf({ shareId }) });
  expect((r.data as { result: string }).result).toBe("received");
  const qr = (r.data as { qr: string }).qr;
  expect((await op.rpc("office_confirm_label", { p_qr: qr })).error).toBeNull();
  return qr;
}

/** 승인 → 입고·라벨 → 검수 통과까지 */
async function inspectedGift(): Promise<{ g: Unit; qr: string }> {
  const g = await paidGift();
  await approve(g);
  const no = waybill();
  await fanSetsWaybill(g.boxIds[0]!, no);
  const op = await staff();
  const qr = await receiveAndLabel(op, no);
  expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
  return { g, qr };
}

/** 검수 통과 → 송장 출력 → 출고 확정 */
async function shippedGift(): Promise<Unit> {
  const { g, qr } = await inspectedGift();
  const out = waybill();
  expect(finishPrint(qr, out)).toBeNull();
  const r = await (await staff()).rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out });
  if (r.error) throw new Error(`office_confirm_shipment 실패: ${r.error.code} ${r.error.message}`);
  return g;
}

/** 승인 → 입고·라벨 → 크리에이터 확인(블루투스)으로 검수 — 확인 대기 상자 */
async function heldGift(): Promise<{ g: Unit; qr: string }> {
  const g = await paidGift();
  await approve(g);
  const no = waybill();
  await fanSetsWaybill(g.boxIds[0]!, no);
  const op = await staff();
  const qr = await receiveAndLabel(op, no);
  expect(await inspect(op, qr, CONFIRM)).toBe("held");
  return { g, qr };
}

async function incomingStages(login: string): Promise<Map<string, string>> {
  const r = await (await signedInClient(login)).rpc("my_incoming_gifts");
  if (r.error) throw new Error(`my_incoming_gifts 실패: ${r.error.message}`);
  return new Map((r.data as { order_no: string; stage: string }[]).map((x) => [x.order_no, x.stage]));
}

async function sentStates(login: string): Promise<{ reply: Map<string, string>; box: Map<string, string> }> {
  const c = await signedInClient(login);
  const a = await c.rpc("my_sent_revgifts");
  const b = await c.rpc("my_share_boxes");
  if (a.error || b.error) throw new Error("보낸 역조공 읽기 실패");
  return {
    reply: new Map((a.data as { order_no: string; state: string }[]).map((x) => [x.order_no, x.state])),
    box: new Map((b.data as { order_no: string; state: string }[]).map((x) => [x.order_no, x.state])),
  };
}

/** 한 처리 안에서 준비 문장(setup)을 실행하고 바로 그 계정으로 select 한다 — 읽는 순간의 now() 가 준비와 같아 경계를 정확히 잰다 */
function atMoment(setup: string, select: string, login = "haru_creator"): string {
  const uid = psql(`select id from public.profiles where login_id = '${login}'`);
  const out = psql(`begin; ${setup}; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${select}; commit;`);
  return out.split("\n").filter((l) => !/^(BEGIN|SET|COMMIT|UPDATE \d+)$/.test(l)).join("|");
}

// ════════════════════════════════════════════════════════════════════════════════════

describe("INV-J9: 선물 현황은 원천에서 계산한 진행 중인 것만 — 단계는 받은 선물·보낸 역조공 읽기와 같다", () => {
  it("INV-J9 S9: 받는 선물 넷(승인 대기·사무실로 오는 중·검수 중·출고) 4줄, 보낸 역조공 두 번(팬 4명·2명) 6줄 — 단계는 기존 읽기와 같다", async () => {
    const waitingGift = await paidGift();
    const coming = await paidGift();
    await approve(coming);
    const checking = await paidGift();
    await approve(checking);
    const no = waybill();
    await fanSetsWaybill(checking.boxIds[0]!, no);
    await receiveAndLabel(await staff(), no);
    const shipped = await shippedGift();
    const giftNos = [waitingGift, coming, checking, shipped].map((g) => g.orderNo);

    const first = await paidSend(FANS.map((fanId) => ({ fanId })));
    backdateSend(first.sendId, "14 days");
    const second = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki, tier: "medium" }]);
    const shareNos = [...first.orderNos, ...second.orderNos];

    const rows = await progress("haru_creator");
    const received = mine(rows, giftNos);
    expect(received.map((r) => r.board)).toEqual(["received", "received", "received", "received"]);
    // 최근 요청이 먼저 — 넷은 같은 순간에 가깝게 만들어 순서 대신 집합으로 본다
    expect(new Set(received.map((r) => r.order_no))).toEqual(new Set(giftNos));
    const stages = await incomingStages("haru_creator");
    for (const r of received) expect(r.stage).toBe(stages.get(r.order_no));
    const by = new Map(received.map((r) => [r.order_no, r]));
    expect([by.get(waitingGift.orderNo)!.stage, by.get(waitingGift.orderNo)!.approval_waiting]).toEqual(["paid", true]);
    expect([by.get(coming.orderNo)!.stage, by.get(coming.orderNo)!.approval_waiting]).toEqual(["paid", false]);
    expect(by.get(checking.orderNo)!.stage).toBe("received");
    expect(by.get(shipped.orderNo)!.stage).toBe("shipped");
    expect(by.get(coming.orderNo)!.approved_at).not.toBeNull();
    expect(by.get(waitingGift.orderNo)!.approved_at).toBeNull();

    const sent = mine(rows, shareNos);
    expect(sent.every((r) => r.board === "sent")).toBe(true);
    // 보낸 날 이른 보내기부터, 보내기 안은 몫 순서 그대로 — 소제목 2개 아래 4줄·2줄
    expect(sent.map((r) => r.order_no)).toEqual(shareNos);
    expect(new Set(sent.slice(0, 4).map((r) => r.sent_at)).size).toBe(1);
    expect(new Set(sent.slice(4).map((r) => r.sent_at)).size).toBe(1);
    expect(sent[0]!.sent_at).not.toBe(sent[4]!.sent_at);
    const { reply, box } = await sentStates("haru_creator");
    for (const r of sent) {
      expect(r.reply_state).toBe(reply.get(r.order_no));
      expect(r.box_state).toBe(box.get(r.order_no));
    }
    expect(sent.map((r) => r.tier)).toEqual(["small", "small", "small", "small", "small", "medium"]);

    // 화면 모양으로 바꾸면 받는 선물 4 · 보낸 날 소제목 2(4명·2명)
    const view = parseGiftProgressRows(rows.filter((r) => giftNos.includes(r.order_no) || shareNos.includes(r.order_no)));
    expect(view.received).toHaveLength(4);
    expect(view.sent.map((b) => b.rows.length)).toEqual([4, 2]);
  });

  it("INV-J9 S9 (카드 d93 ⑤): 출고된 줄은 배송 칸이 수령이 될 때 빠진다 — 배송 중이면 남고, 수령이면 없다", async () => {
    const g = await shippedGift();
    psql(`update public.orders set delivery = 'in_transit' where id = '${g.orderId}'`);
    expect(mine(await progress("haru_creator"), [g.orderNo]).map((r) => r.stage)).toEqual(["in_transit"]);
    psql(`update public.orders set delivery = 'delivered', delivered_at = now() where id = '${g.orderId}'`);
    expect(mine(await progress("haru_creator"), [g.orderNo])).toEqual([]);
  });

  it("INV-J9 S9b (실패경로): 결제 대기 주문·받지 않은 주문·결제 대기 보내기·받지 않음 뒤 닫힌 몫은 없다 — 같은 때 진행 중인 것은 있다", async () => {
    const pending = await registerTestOrder(1);
    const declined = await paidGift();
    const d = await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: declined.requestId, p_block: false });
    expect(d.error).toBeNull();
    const live = await paidGift();
    const unpaidSend = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const send = await paidSend([{ fanId: PROFILE.byeolbit }]);
    expect((await (await signedInClient("byeolbit_fan")).rpc("decline_revgift", { p_order_no: send.orderNos[0] })).error).toBeNull();

    const nos = [pending.orderNo, declined.orderNo, live.orderNo, ...unpaidSend.orderNos, send.orderNos[0]!];
    // 받지 않음 뒤에도 살려 둔 6자리로 상자가 올 수 있는 동안은 남는다(닫히지 않음)
    expect(mine(await progress("haru_creator"), nos).map((r) => r.order_no)).toEqual([live.orderNo, send.orderNos[0]]);
    closeKeptShares(`s.order_no = '${send.orderNos[0]}'`);
    expect(mine(await progress("haru_creator"), nos).map((r) => r.order_no)).toEqual([live.orderNo]);
  });

  it("INV-J9 (실패경로): 검수에서 반송이 확정된 주문은 없다 — 같은 때 검수 통과 주문은 있다", async () => {
    const passed = await inspectedGift();
    const back = await paidGift();
    await approve(back);
    const no = waybill();
    await fanSetsWaybill(back.boxIds[0]!, no);
    const op = await staff();
    const qr = await receiveAndLabel(op, no);
    await inspect(op, qr, { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" });
    expect(mine(await progress("haru_creator"), [passed.g.orderNo, back.orderNo]).map((r) => [r.order_no, r.stage])).toEqual([[passed.g.orderNo, "inspected"]]);
  });
});

describe("INV-J9 (실패경로): 보내는 선물에서 빠지는 조건 — 갈래마다 같은 보내기의 진행 중 몫과 나란히", () => {
  /** 한 처리 안에서 트리거 없이 몫·상자 줄을 고친다 — 취소·반송 처리 경로가 아니라 그 결과 상태만 만든다 */
  const force = (sql: string) => psql(`begin; set local session_replication_role = replica; ${sql}; commit;`);

  it("INV-J9: 취소 기록이 있는 몫은 없다 — 같은 보내기의 다른 몫은 있다", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    force(`update public.revgift_shares set cancelled_at = now() where id = '${send.shareIds[0]}'`);
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => r.order_no)).toEqual([send.orderNos[1]]);
  });

  it("INV-J9: 반송 기록(returned_at)이 있는 몫은 없다 — 같은 보내기의 다른 몫은 있다", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    force(`update public.revgift_shares set returned_at = now() where id = '${send.shareIds[0]}'`);
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => r.order_no)).toEqual([send.orderNos[1]]);
  });

  it("INV-J9: 상자가 반송(returned)된 몫은 없다 — 반송 대기 상자인 몫은 있다", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    await receiveShareWithCode(send.shareIds[0]!);
    await receiveShareWithCode(send.shareIds[1]!);
    force(`update public.office_parcels set state = 'returned', return_waybill_no = '900000000001', returned_at = now() where share_id = '${send.shareIds[0]}'`);
    force(`update public.office_parcels set state = 'return_waiting' where share_id = '${send.shareIds[1]}'`);
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => [r.order_no, r.box_state])).toEqual([[send.orderNos[1], "return_waiting"]]);
  });

  it("INV-J9: 받지 않음이어도 상자가 사무실에 왔으면 남는다 — 받지 않음·상자 안 옴·6자리 닫힘이면 없다", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    const fan = async (login: string, no: string) => expect((await (await signedInClient(login)).rpc("decline_revgift", { p_order_no: no })).error).toBeNull();
    await fan("byeolbit_fan", send.orderNos[0]!);
    await fan("daltokki_fan", send.orderNos[1]!);
    await receiveShareWithCode(send.shareIds[0]!);
    closeKeptShares(`s.id = '${send.shareIds[1]}'`);
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => [r.order_no, r.reply_state, r.box_state])).toEqual([[send.orderNos[0], "not_received", "labeled"]]);
  });
});

describe("INV-J10 (실패경로): 크리에이터 역할일 때만 — 보낸 기록이 있어도 역할이 크리에이터가 아니면 0줄", () => {
  /** 한 처리 안에서 하루의 역할을 role 로 두고 그 계정으로 센 뒤 되돌린다(rollback — 시드 계정은 바뀌지 않는다) */
  const countAs = (role: string, nos: readonly string[]) =>
    psql(
      `begin; update public.profiles set role = '${role}' where id = '${PROFILE.haru}'; set local request.jwt.claims = '{"sub":"${PROFILE.haru}","role":"authenticated"}'; ` +
        `select count(*) from public.my_gift_progress() where order_no in (${nos.map((n) => `'${n}'`).join(",")}); rollback;`,
    )
      .split("\n")
      .filter((l) => /^\d+$/.test(l))
      .join("|");

  it("INV-J10 S10: 하루의 결제 끝난 보내기 — 크리에이터면 2줄, 같은 처리에서 역할을 팬으로 바꾸면 0줄", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    expect(countAs("creator", send.orderNos)).toBe("2");
    expect(countAs("fan", send.orderNos)).toBe("0");
    expect(psql(`select role from public.profiles where id = '${PROFILE.haru}'`)).toBe("creator");
  });
});

describe("INV-J9 (카드 d97 ①): 주문 단계는 반송되지 않은 상자들로 — 남은 상자가 전부 반송일 때만 「반송」", () => {
  const RETURN = { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" } as const;

  /** 상자 둘 — 둘 다 승인·입고·라벨 */
  async function twoBoxes(): Promise<{ g: Unit; qrs: string[] }> {
    const g = await paidGift(2);
    await approve(g);
    const op = await staff();
    const qrs: string[] = [];
    for (const boxId of g.boxIds) {
      const no = waybill();
      await fanSetsWaybill(boxId, no);
      qrs.push(await receiveAndLabel(op, no));
    }
    return { g, qrs };
  }

  it("INV-J9: 1번 반송 대기 + 2번 블루투스 확인 대기 → 현황에 남고(받은 선물 단계와 같다) 「처리할 일」 버튼", async () => {
    const { g, qrs } = await twoBoxes();
    const op = await staff();
    expect(await inspect(op, qrs[0]!, RETURN)).toBe("return_waiting");
    expect(await inspect(op, qrs[1]!, CONFIRM)).toBe("held");
    const rows = mine(await progress("haru_creator"), [g.orderNo]);
    expect(rows.map((r) => r.stage)).toEqual(["received"]);
    expect((await incomingStages("haru_creator")).get(g.orderNo)).toBe("received");
    const haru = await signedInClient("haru_creator");
    const items = parseCreatorActionItems((await haru.rpc("my_creator_action_items")).data);
    const view = parseGiftProgressRows(rows);
    expect(view.received.map((r) => hasActionButton(r, actionTargetsOf(items)))).toEqual([true]);
  });

  it("INV-J9 (실패경로): 둘 다 반송이면 받은 선물 단계는 「반송」이고 현황에서 빠진다", async () => {
    const { g, qrs } = await twoBoxes();
    const op = await staff();
    expect(await inspect(op, qrs[0]!, RETURN)).toBe("return_waiting");
    expect(await inspect(op, qrs[1]!, RETURN)).toBe("return_waiting");
    expect(mine(await progress("haru_creator"), [g.orderNo])).toEqual([]);
    expect((await incomingStages("haru_creator")).get(g.orderNo)).toBe("returned");
  });

  it("INV-J9: 1번 반송 대기 + 2번 검수 통과 → 「검수 완료」 단계, 받은 선물 읽기의 검수 결과는 통과", async () => {
    const { g, qrs } = await twoBoxes();
    const op = await staff();
    expect(await inspect(op, qrs[0]!, RETURN)).toBe("return_waiting");
    expect(await inspect(op, qrs[1]!, FAN_PASS)).toBe("inspected");
    expect(mine(await progress("haru_creator"), [g.orderNo]).map((r) => r.stage)).toEqual(["inspected"]);
    const r = await (await signedInClient("haru_creator")).rpc("my_incoming_gifts");
    expect((r.data as { order_no: string; inspection_result: string }[]).find((x) => x.order_no === g.orderNo)?.inspection_result).toBe("passed");
  });
});

describe("INV-J9 (카드 d97 ②): 역조공 몫의 수령 칸 — 출고된 몫은 수령이면 빠진다", () => {
  /** 몫을 출고된 상태로(트리거 없이 결과 상태만) — 출고 처리 경로는 office-workflow 시험이 본다 */
  const shipShare = (shareId: string) =>
    psql(
      `begin; set local session_replication_role = replica; ` +
        `update public.revgift_shares set reply = 'accepted', replied_at = now(), received_at = now(), inspected_at = now(), shipped_at = now() where id = '${shareId}'; ` +
        `update public.office_parcels set state = 'shipped', received_at = now(), inspected_at = now(), shipped_at = now(), outbound_waybill_no = '900000000002' where share_id = '${shareId}'; commit;`,
    );

  it("INV-J9: 출고된 몫 — 수령 칸이 비었거나 배송 중이면 남고, 수령이면 없다. 같은 보내기의 다른 몫은 그대로", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    shipShare(send.shareIds[0]!);
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => [r.order_no, r.box_state])).toEqual([
      [send.orderNos[0], "shipped"],
      [send.orderNos[1], "awaiting"],
    ]);
    psql(`update public.revgift_shares set delivery = 'in_transit' where id = '${send.shareIds[0]}'`);
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => r.order_no)).toEqual(send.orderNos);
    psql(`update public.revgift_shares set delivery = 'delivered', delivered_at = now() where id = '${send.shareIds[0]}'`);
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => r.order_no)).toEqual([send.orderNos[1]]);
  });

  it("INV-J9 (실패경로): 수령 칸은 팬 선물과 같은 값만 받는다 — 다른 값은 DB 가 받지 않는다", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }]);
    expect(() => psql(`update public.revgift_shares set delivery = 'arrived' where id = '${send.shareIds[0]}'`)).toThrow();
    expect(() => psql(`update public.revgift_shares set delivery = 'delivered' where id = '${send.shareIds[0]}'`)).not.toThrow();
  });
});

describe("INV-J10: 인자 없이 로그인 토큰의 크리에이터 것만, 정해진 칸만", () => {
  it("INV-J10 S10 (실패경로): 하루는 하루 것만, 모모는 모모 것만 — 팬·직원·대표·로그인 안 함은 0줄", async () => {
    const haruGift = await paidGift();
    const momoGift = await paidGift(1, MOMO_CREATOR_ID);
    const haruSend = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const momoSend = await paidSend([{ fanId: PROFILE.daltokki }], "momo");
    const nos = [haruGift.orderNo, momoGift.orderNo, haruSend.orderNos[0]!, momoSend.orderNos[0]!];

    expect(mine(await progress("haru_creator"), nos).map((r) => r.order_no)).toEqual([haruGift.orderNo, haruSend.orderNos[0]]);
    expect(mine(await progress("momo_creator"), nos).map((r) => r.order_no)).toEqual([momoGift.orderNo, momoSend.orderNos[0]]);
    for (const login of ["byeolbit_fan", "fankkuk_staff", "fankkuk_admin"]) expect(await progress(login)).toEqual([]);
    const anon = await anonClient().rpc("my_gift_progress");
    expect(anon.data ?? []).toEqual([]);
  });

  it("INV-J10 S10 (실패경로): 계정·크리에이터 ID 를 인자로 받지 않는다 — 모모 ID 를 넣어도 부를 길이 없다", async () => {
    expect(psql("select string_agg(pronargs::text, ',') from pg_proc where proname = 'my_gift_progress' and pronamespace = 'public'::regnamespace")).toBe("0");
    const haru = await signedInClient("haru_creator");
    const r = await haru.rpc("my_gift_progress", { p_creator_id: MOMO_CREATOR_ID });
    expect(r.error?.code).toBe("PGRST202");
  });

  it("INV-J10 S10: 응답 칸은 정해진 것뿐 — 팬 주소·6자리·원 송장번호·메모·운영자 칸이 없다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    const send = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const rows = mine(await progress("haru_creator"), [g.orderNo, send.orderNos[0]!]);
    expect(rows).toHaveLength(2);
    const keys = [
      "board", "order_no", "share_id", "nickname", "item_kind", "box_count", "tier", "stage", "approval_waiting",
      "requested_at", "approved_at", "reply_state", "box_state", "sent_at", "before_inbound", "late",
    ];
    for (const r of rows) expect(Object.keys(r).sort()).toEqual([...keys].sort());
    const text = JSON.stringify(rows);
    expect(text).not.toContain(no);
    expect(text).not.toContain(codeOf({ shareId: send.shareIds[0]! })!);
    expect(text).not.toContain(codeOf({ boxId: g.boxIds[0]! })!);
  });

  it("INV-J10 (카드 d96 ①): 「내 상자 찾기」 자리 — 보내는 선물의 입고 전 줄은 늦지 않아도 before_inbound, 입고되면 아니다", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    await receiveShareWithCode(send.shareIds[1]!);
    const rows = mine(await progress("haru_creator"), send.orderNos);
    expect(rows.map((r) => [r.order_no, r.before_inbound, r.late, r.box_state])).toEqual([
      [send.orderNos[0], true, false, "awaiting"],
      [send.orderNos[1], false, false, "labeled"],
    ]);
    // 찾기 후보 읽기와 같은 판정
    const c = await (await signedInClient("haru_creator")).rpc("my_revgift_find_candidates");
    expect((c.data as { share_id: string }[]).map((x) => x.share_id).filter((id) => send.shareIds.includes(id))).toEqual([send.shareIds[0]]);
    expect(rows.map((r) => r.share_id)).toEqual(send.shareIds);
  });
});

describe("INV-J11: 늦음은 처리할 일의 미확인 상자와 같은 함수, 「처리할 일」 버튼은 처리할 일 읽기 결과에서", () => {
  it("INV-J11: 결제 완료 뒤 336시간 정각부터 늦음 — 335시간 59분은 아니다(읽는 순간 고정)", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }]);
    const sel = `select late from public.my_gift_progress() where order_no = '${send.orderNos[0]}'`;
    expect(atMoment(`update public.revgift_sends set settled_at = now() - interval '335 hours 59 minutes' where id = '${send.sendId}'`, sel)).toBe("f");
    expect(atMoment(`update public.revgift_sends set settled_at = now() - interval '336 hours' where id = '${send.sendId}'`, sel)).toBe("t");
  });

  it("INV-J11 (실패경로): 늦어도 입고되면 늦음이 아니다 — 같은 보내기의 입고 전 몫은 늦음", async () => {
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    await receiveShareWithCode(send.shareIds[1]!);
    backdateSend(send.sendId, "15 days");
    expect(mine(await progress("haru_creator"), send.orderNos).map((r) => r.late)).toEqual([true, false]);
  });

  it("INV-J11 S11: 승인 대기 줄·확인 대기 상자가 있는 검수 중 줄·늦은 몫 줄에만 「처리할 일」 — 사무실로 오는 중인 줄은 없다", async () => {
    const waitingGift = await paidGift();
    const held = await heldGift();
    const coming = await paidGift();
    await approve(coming);
    const send = await paidSend([{ fanId: PROFILE.byeolbit }, { fanId: PROFILE.daltokki }]);
    backdateSend(send.sendId, "15 days");
    await receiveShareWithCode(send.shareIds[1]!);
    const nos = [waitingGift.orderNo, held.g.orderNo, coming.orderNo, ...send.orderNos];

    const haru = await signedInClient("haru_creator");
    const items = parseCreatorActionItems((await haru.rpc("my_creator_action_items")).data);
    const view = parseGiftProgressRows(mine(await progress("haru_creator"), nos));
    const targets = actionTargetsOf(items);
    const withButton = [...view.received, ...view.sent.flatMap((b) => b.rows)].filter((r) => hasActionButton(r, targets)).map((r) => r.orderNo);
    expect(new Set(withButton)).toEqual(new Set([waitingGift.orderNo, held.g.orderNo, send.orderNos[0]]));
  });

  it("INV-J11 S11b (실패경로): 운영자가 확인 상자를 처리해 처리할 일에서 빠진 주문은 버튼이 없다", async () => {
    const held = await heldGift();
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("choose_creator_check", { p_order_no: held.g.orderNo, p_box_seq: 1, p_choice: "accept" })).data).toBe("chosen");
    const read = async () => {
      const items = parseCreatorActionItems((await haru.rpc("my_creator_action_items")).data);
      const view = parseGiftProgressRows(mine(await progress("haru_creator"), [held.g.orderNo]));
      return view.received.map((r) => hasActionButton(r, actionTargetsOf(items)));
    };
    expect(await read()).toEqual([true]);
    expect((await (await staff()).rpc("office_process_creator_check", { p_qr: held.qr, p_seen_choice: "accept" })).data).toBe("accepted");
    expect(await read()).toEqual([false]);
  });
});

