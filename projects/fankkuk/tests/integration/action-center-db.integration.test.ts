import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { labeled, measure, paidOrder } from "./difference-helpers";
import { adminClient, anonClient, deleteTestOrders, payTestOrder, psql, registerTestOrder, SEED, signedInClient } from "./helpers";
import { approve, deleteTestUnmatched, fanSetsWaybill, paidGift, receiveAndLabel, scanInbound, waybill, type Unit } from "./office-helpers";
import { backdateSettlement, deleteTestRevgifts, followHaru, paidShareFor, PROFILE, sampleEnvelope, unfollowHaru } from "./revgift-helpers";

// 처리할 일 (action-center INV-J1·J3·J4). 카드는 저장하지 않고 읽을 때마다 원천(차액 요청·상자·역조공 몫)에서 계산한다.
// 읽기 함수 하나(my_action_items) — 계정 인자 없이 로그인 토큰의 계정 것만. 시간은 원천의 시각(차액 요청 시각·결제 완료 시각)을 앞으로 옮겨 흉내 낸다.
// 시드 계정에는 시드 주문이 있을 수 있어, 비교는 이 시험이 만든 주문번호로 거른다(남의 것이 섞였는지는 거르지 않고 본다).

type Row = {
  kind: string;
  order_no: string;
  box_id: string | null;
  box_label: string | null;
  box_seq: number | null;
  creator_name: string;
  tier: string;
  measured_tier: string | null;
  amount_krw: number | null;
  due_at: string;
};

const ROW_KEYS = ["amount_krw", "box_id", "box_label", "box_seq", "creator_name", "due_at", "kind", "measured_tier", "order_no", "tier"];

async function read(login: string): Promise<Row[]> {
  const r = await (await signedInClient(login)).rpc("my_action_items");
  if (r.error) throw new Error(`my_action_items 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Row[];
}

/** 이 시험이 만든 주문번호의 카드만, 「종류:주문번호:상자 순번」 꼴로(정렬해서 — 순서는 기한순이라 시험마다 다르다) */
async function cards(login: string, orderNos: readonly string[]): Promise<string[]> {
  return (await read(login))
    .filter((r) => orderNos.includes(r.order_no))
    .map((r) => `${r.kind}:${r.order_no}:${r.box_seq ?? "-"}`)
    .sort();
}

const backdateOrder = (orderId: string, hours: number, minutes = 0) =>
  psql(`update public.orders set registered_at = now() - interval '${hours} hours ${minutes} minutes' where id = '${orderId}'`);
const backdateDifference = (orderId: string, hours: number, minutes = 0) =>
  psql(`update public.payments set created_at = now() - interval '${hours} hours ${minutes} minutes' where order_id = '${orderId}' and kind = 'difference'`);
const differenceToss = (orderId: string) => psql(`select toss_order_id from public.payments where order_id = '${orderId}' and kind = 'difference'`);

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

/** 실측 중형 → 차액 2,000원 요청이 있는 소형 상자 하나짜리 주문(별빛 → 하루) */
async function differenceOrder(): Promise<{ orderId: string; orderNo: string; boxId: string }> {
  const g = await paidOrder(["small"]);
  const qr = await labeled(g.boxIds[0]!);
  const m = await measure(qr, "medium");
  if (m.error) throw new Error(`실측 실패: ${m.error.code}`);
  return { orderId: g.orderId, orderNo: g.orderNo, boxId: g.boxIds[0]! };
}

/** 승인된 상자 n 개 주문(입고 전), 결제 완료를 hours 시간 전으로 */
async function waitingGift(boxes: number, hours: number): Promise<Unit> {
  const g = await paidGift(boxes);
  await approve(g);
  backdateOrder(g.orderId, hours);
  return g;
}

async function runExpiry(orderNo: string): Promise<void> {
  const r = await (await staff()).rpc("office_run_expiry", { p_order_no: orderNo });
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.code} ${r.error.message}`);
}

async function receive(boxId: string): Promise<void> {
  const code = psql(`select code from public.inbound_codes where box_id = '${boxId}'`);
  const op = await staff();
  const r = await scanInbound(op, waybill(), { code });
  expect(r.data).toMatchObject({ result: "received" });
  // 라벨 부착 확인까지 — 남겨 두면 그 직원의 다음 입고가 막힌다
  expect((await op.rpc("office_confirm_label", { p_qr: (r.data as { qr: string }).qr })).error).toBeNull();
}

beforeAll(() => {
  deleteTestOrders();
  deleteTestRevgifts();
});
afterEach(() => deleteTestUnmatched());
afterAll(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

describe("INV-J1: 카드는 세 종류, 상자(몫) 하나에 하나, 보이는 조건은 처리 함수가 받아 주는 조건", () => {
  it("INV-J1 S1: 차액 요청(미결제, 요청 뒤 2일) → 추가 결제 1 · 결제 뒤 15일 입고 전 상자 → 도착하지 않은 상자 1 · 13일 된 상자는 없음", async () => {
    const d = await differenceOrder();
    backdateDifference(d.orderId, 48);
    const late = await waitingGift(1, 15 * 24);
    const early = await waitingGift(1, 13 * 24);
    expect(await cards("byeolbit_fan", [d.orderNo, late.orderNo, early.orderNo])).toEqual([
      `difference:${d.orderNo}:1`,
      `missing_box:${late.orderNo}:1`,
    ]);
    const rows = await read("byeolbit_fan");
    const diff = rows.find((r) => r.order_no === d.orderNo)!;
    expect(diff).toMatchObject({ box_id: d.boxId, box_label: d.orderNo, tier: "small", measured_tier: "medium", amount_krw: 2000, creator_name: "하루" });
    // 기한 = 요청 + 168시간
    expect(Date.parse(diff.due_at)).toBe(Date.parse(psql(`select to_json(created_at + interval '168 hours')#>>'{}' from public.payments where order_id = '${d.orderId}' and kind = 'difference'`)));
    const box = rows.find((r) => r.order_no === late.orderNo)!;
    expect(box).toMatchObject({ box_id: late.boxIds[0], tier: "small", measured_tier: null, amount_krw: null });
    // 기한 = 결제 완료 + 720시간(그때 상자가 닫힌다)
    expect(Date.parse(box.due_at)).toBe(Date.parse(psql(`select to_json(registered_at + interval '720 hours')#>>'{}' from public.orders where id = '${late.orderId}'`)));
  });

  it("INV-J1 S1 (경계): 도착하지 않은 상자는 결제 + 336시간부터 — 335시간 59분이면 없다. 상자 둘 중 입고된 것은 카드가 없다", async () => {
    const g = await waitingGift(2, 335);
    psql(`update public.orders set registered_at = now() - interval '335 hours 59 minutes' where id = '${g.orderId}'`);
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([]);
    backdateOrder(g.orderId, 336);
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([`missing_box:${g.orderNo}:1`, `missing_box:${g.orderNo}:2`]);
    await receive(g.boxIds[0]!);
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([`missing_box:${g.orderNo}:2`]);
    // 상자가 둘 이상이면 이름표는 주문번호-순번(선물 상세와 같다)
    expect((await read("byeolbit_fan")).find((r) => r.order_no === g.orderNo)?.box_label).toBe(`${g.orderNo}-2`);
  });

  it("INV-J1 S1 (경계): 추가 결제는 요청 + 168시간 전까지 — 167시간 59분이면 있고 168시간이면 없다(차액 결제 준비도 그때부터 거부)", async () => {
    const d = await differenceOrder();
    backdateDifference(d.orderId, 167, 59);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([`difference:${d.orderNo}:1`]);
    backdateDifference(d.orderId, 168);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([]);
    const prepared = await (await signedInClient("byeolbit_fan")).rpc("prepare_difference_payment", { p_box_id: d.boxId });
    expect(prepared.error?.code).toBe("P0022");
  });

  it("INV-J1 S1b (실패경로): 차액 결제 완료 → 카드 없음", async () => {
    const d = await differenceOrder();
    const toss = differenceToss(d.orderId);
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss })).data).toBe(true);
    expect((await adminClient().rpc("settle_difference_payment", { p_toss_order_id: toss, p_status: "done", p_payment_key: `pk_${toss}` })).data).toBe(true);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([]);
  });

  it("INV-J1 S1b (실패경로): 7일 처리가 기한 지남을 적은 차액(요청 뒤 시간이 남았어도) → 카드 없음, 결제 준비도 거부", async () => {
    const d = await differenceOrder();
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([`difference:${d.orderNo}:1`]);
    psql(`update public.payments set expired_at = now() where order_id = '${d.orderId}' and kind = 'difference'`);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([]);
    expect((await (await signedInClient("byeolbit_fan")).rpc("prepare_difference_payment", { p_box_id: d.boxId })).error?.code).toBe("P0022");
  });

  it("INV-J1 S1b (실패경로): 상자가 반송 대기로 간 차액 → 카드 없음, 결제 준비도 거부", async () => {
    const d = await differenceOrder();
    psql(`begin; set local session_replication_role = replica; update public.office_parcels set state = 'return_waiting' where box_id = '${d.boxId}'; commit;`);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([]);
    expect((await (await signedInClient("byeolbit_fan")).rpc("prepare_difference_payment", { p_box_id: d.boxId })).error?.code).toBe("P0022");
  });

  it("INV-J1 S1b (실패경로): 거절로 끝난 주문의 입고 전 상자 · 반려된 주문의 차액 → 카드 없음", async () => {
    const g = await waitingGift(1, 400);
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([`missing_box:${g.orderNo}:1`]);
    psql(`update public.orders set status = 'rejected' where id = '${g.orderId}'`);
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([]);
    const d = await differenceOrder();
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([`difference:${d.orderNo}:1`]);
    psql(`update public.orders set status = 'expired' where id = '${d.orderId}'`);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([]);
  });

  // 주문 상태 · 상자 상태 하나씩 — 카드가 차액 결제 준비(prepare_difference_payment)의 판정과 같은지
  for (const status of ["canceled", "rejected"] as const) {
    it(`INV-J1 S1b (실패경로): ${status} 주문의 차액 → 카드 없음, 결제 준비도 거부(P0022)`, async () => {
      const d = await differenceOrder();
      expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([`difference:${d.orderNo}:1`]);
      psql(`update public.orders set status = '${status}' where id = '${d.orderId}'`);
      expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([]);
      expect((await (await signedInClient("byeolbit_fan")).rpc("prepare_difference_payment", { p_box_id: d.boxId })).error?.code).toBe("P0022");
    });
  }

  it("INV-J1 S1: 상자가 크리에이터 확인 대기(held)인 차액 → 결제 준비가 받아 주므로 카드가 있다", async () => {
    const d = await differenceOrder();
    psql(`begin; set local session_replication_role = replica; update public.office_parcels set state = 'held' where box_id = '${d.boxId}'; commit;`);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([`difference:${d.orderNo}:1`]);
    const prepared = await (await signedInClient("byeolbit_fan")).rpc("prepare_difference_payment", { p_box_id: d.boxId });
    expect(prepared.error).toBeNull();
    expect(prepared.data).toEqual([expect.objectContaining({ order_no: d.orderNo, amount_krw: 2000 })]);
  });

  it("INV-J1 S1b (실패경로): 결제 + 720시간에 닫힌 상자는 카드가 없고, 같은 주문의 입고된 상자도 없다", async () => {
    const g = await waitingGift(2, 400);
    await receive(g.boxIds[0]!);
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([`missing_box:${g.orderNo}:2`]);
    backdateOrder(g.orderId, 720);
    await runExpiry(g.orderNo);
    expect(psql(`select missing_at is not null from public.boxes where id = '${g.boxIds[1]}'`)).toBe("t");
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([]);
  });

  it("INV-J1 S1c: 별빛이 받는 역조공 몫(결제 뒤 3일, 받기 전) → 역조공 받기 1, 기한은 결제 + 168시간", async () => {
    const share = await paidShareFor(PROFILE.byeolbit);
    backdateSettlement(share.send, 72);
    expect(await cards("byeolbit_fan", [share.orderNo])).toEqual([`revgift:${share.orderNo}:-`]);
    const row = (await read("byeolbit_fan")).find((r) => r.order_no === share.orderNo)!;
    expect(row).toMatchObject({ box_id: null, box_label: null, tier: "small", amount_krw: null, creator_name: "하루" });
    expect(Date.parse(row.due_at)).toBe(Date.parse(psql(`select to_json(settled_at + interval '168 hours')#>>'{}' from public.revgift_sends where id = '${share.send.sendId}'`)));
  });

  it("INV-J1 S1c (실패경로): 받지 않은 뒤 · 받은 뒤 · 결제 뒤 168시간이 지난 뒤(기한 처리 전이라도)에는 없다", async () => {
    const declined = await paidShareFor(PROFILE.byeolbit);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("decline_revgift", { p_order_no: declined.orderNo })).error).toBeNull();
    const accepted = await paidShareFor(PROFILE.byeolbit);
    expect((await fan.rpc("accept_revgift", { p_order_no: accepted.orderNo, p_envelope: sampleEnvelope() })).error).toBeNull();
    const late = await paidShareFor(PROFILE.byeolbit);
    backdateSettlement(late.send, 167, 59);
    expect(await cards("byeolbit_fan", [declined.orderNo, accepted.orderNo, late.orderNo])).toEqual([`revgift:${late.orderNo}:-`]);
    backdateSettlement(late.send, 168);
    expect(psql(`select reply from public.revgift_shares where order_no = '${late.orderNo}'`)).toBe("waiting");
    expect(await cards("byeolbit_fan", [declined.orderNo, accepted.orderNo, late.orderNo])).toEqual([]);
  });

  it("INV-J1 S1c (실패경로): 보내기가 취소된 몫 → 카드 없음, 받지 않기도 거부", async () => {
    const share = await paidShareFor(PROFILE.byeolbit);
    expect(await cards("byeolbit_fan", [share.orderNo])).toEqual([`revgift:${share.orderNo}:-`]);
    psql(`begin; set local session_replication_role = replica; update public.revgift_shares set cancelled_at = now() where id = '${share.shareId}'; commit;`);
    expect(await cards("byeolbit_fan", [share.orderNo])).toEqual([]);
    expect((await (await signedInClient("byeolbit_fan")).rpc("decline_revgift", { p_order_no: share.orderNo })).error?.code).toBe("P0022");
  });

  it("INV-J1: 카드를 저장하는 표·숫자 칸이 없다 — 이름에 action_item·todo 가 든 표·칸이 public 에 없다", () => {
    const like = (col: string) => `(${col} like '%action_item%' or ${col} like '%todo%')`;
    expect(psql(`select count(*) from information_schema.tables where table_schema = 'public' and ${like("table_name")} and table_type = 'BASE TABLE'`)).toBe("0");
    expect(psql(`select count(*) from information_schema.columns c join information_schema.tables t using (table_schema, table_name) where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and ${like("c.column_name")}`)).toBe("0");
  });
});

describe("INV-J3: 계정 인자 없음, 로그인 토큰의 계정 것만, 칸은 기존 읽기의 칸까지", () => {
  it("INV-J3: 읽기 함수는 인자가 없다", () => {
    expect(psql("select pg_get_function_identity_arguments('public.my_action_items'::regproc)")).toBe("");
  });

  it("INV-J3 S3 (실패경로): 별빛·달토끼 각자 카드 — 별빛은 자기 것만, 달토끼는 자기 것만", async () => {
    followHaru([PROFILE.daltokki]);
    try {
      const mine = await waitingGift(1, 400);
      const o = await registerTestOrder(1, { senderId: SEED.otherFanId });
      const requestId = await payTestOrder(o);
      await approve({ kind: "box", orderId: o.orderId, orderNo: o.orderNo, requestId, boxIds: [] });
      backdateOrder(o.orderId, 400);
      const dalShare = await paidShareFor(PROFILE.daltokki);
      const byeol = await read("byeolbit_fan");
      expect(byeol.some((r) => r.order_no === mine.orderNo)).toBe(true);
      expect(byeol.filter((r) => [o.orderNo, dalShare.orderNo].includes(r.order_no))).toEqual([]);
      expect(await cards("daltokki_fan", [mine.orderNo, o.orderNo, dalShare.orderNo])).toEqual([`missing_box:${o.orderNo}:1`, `revgift:${dalShare.orderNo}:-`]);
    } finally {
      unfollowHaru([PROFILE.daltokki]);
    }
  });

  it("INV-J3 S3 (실패경로): 직원·대표는 0줄, 로그인하지 않으면 줄이 없다", async () => {
    await waitingGift(1, 400);
    expect(await read("fankkuk_staff")).toEqual([]);
    expect(await read("fankkuk_admin")).toEqual([]);
    const anon = await anonClient().rpc("my_action_items");
    expect(anon.data ?? []).toEqual([]);
  });

  it("INV-J3 S3: 카드 칸은 정해진 열 개뿐 — 크리에이터 주소·연락처·나만 보는 메모가 없다", async () => {
    const d = await differenceOrder();
    psql(`insert into public.gift_memos (order_id, title, body) values ('${d.orderId}', '메모-카나리아', '메모 본문 카나리아')`);
    const rows = (await read("byeolbit_fan")).filter((r) => r.order_no === d.orderNo);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(ROW_KEYS);
    expect(JSON.stringify(rows)).not.toContain("카나리아");
  });

  it("INV-J3 S3b: 하루(크리에이터)가 모모에게 보낸 선물에 차액 요청 → 하루로 읽으면 추가 결제 1", async () => {
    const o = await registerTestOrder(1, { senderId: PROFILE.haru, creatorId: "00000000-0000-4000-b000-000000000002" });
    await payTestOrder(o);
    const boxId = psql(`select id from public.boxes where order_id = '${o.orderId}'`);
    const no = waybill();
    await fanSetsWaybill(boxId, no, "haru_creator");
    const qr = await receiveAndLabel(await staff(), no);
    expect((await measure(qr, "medium")).error).toBeNull();
    expect(await cards("haru_creator", [o.orderNo])).toEqual([`difference:${o.orderNo}:1`]);
    expect(await cards("byeolbit_fan", [o.orderNo])).toEqual([]);
  });

  it("INV-J3 S3 (실패경로): 하루(크리에이터)가 받는 주문(별빛 → 하루)의 차액은 하루로 읽으면 0줄 — 받는 사람이 아니라 보낸 사람 것", async () => {
    const d = await differenceOrder();
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([`difference:${d.orderNo}:1`]);
    expect(await cards("haru_creator", [d.orderNo])).toEqual([]);
  });
});

describe("INV-J4: 버튼은 기존 처리를 부르고, 카드는 원천 상태로 사라진다", () => {
  async function holdWithoutCode(barcode: string, initial = "별"): Promise<void> {
    const r = await scanInbound(await staff(), barcode, { code: null, carrier: "cj", initial, shelf: "T-1" });
    expect(r.error).toBeNull();
    expect((r.data as { result: string }).result).toBe("hold");
  }

  async function find(boxId: string, no: string, initial: string) {
    return (await signedInClient("byeolbit_fan")).rpc("find_held_parcel", {
      p_box_id: boxId,
      p_share_id: null,
      p_waybill: no,
      p_carrier: "cj",
      p_sender_initial: initial,
    });
  }

  it("INV-J4 S4: 도착하지 않은 상자 카드 → 세 값이 맞는 찾기(받는 주소 없이 보냈어요) → 상자가 이어지고 카드가 사라진다", async () => {
    const g = await waitingGift(1, 400);
    const barcode = waybill();
    await holdWithoutCode(barcode);
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([`missing_box:${g.orderNo}:1`]);
    expect((await find(g.boxIds[0]!, barcode, "별")).data).toBe("matched");
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([]);
  });

  it("INV-J4 S4b (실패경로): 세 값이 틀린 찾기(이름 앞 글자 다름) → 이어지지 않고 카드가 남는다", async () => {
    const g = await waitingGift(1, 400);
    const barcode = waybill();
    await holdWithoutCode(barcode);
    expect((await find(g.boxIds[0]!, barcode, "달")).data).toBe("not_found");
    expect(await cards("byeolbit_fan", [g.orderNo])).toEqual([`missing_box:${g.orderNo}:1`]);
  });

  it("INV-J4 S4b: 차액 결제가 승인 중이면 카드 없음(결제 준비도 거부), 결제가 실패로 끝나면 다시 있다", async () => {
    const d = await differenceOrder();
    const toss = differenceToss(d.orderId);
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss })).data).toBe(true);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([]);
    expect((await (await signedInClient("byeolbit_fan")).rpc("prepare_difference_payment", { p_box_id: d.boxId })).error?.code).toBe("P0024");
    expect((await adminClient().rpc("settle_difference_payment", { p_toss_order_id: toss, p_status: "failed", p_payment_key: null })).data).toBe(true);
    expect(await cards("byeolbit_fan", [d.orderNo])).toEqual([`difference:${d.orderNo}:1`]);
  });

  it("INV-J4: 역조공 받지 않기(기존 처리)를 부르면 다음 읽기에서 그 카드가 없다", async () => {
    const share = await paidShareFor(PROFILE.byeolbit);
    expect(await cards("byeolbit_fan", [share.orderNo])).toEqual([`revgift:${share.orderNo}:-`]);
    expect((await (await signedInClient("byeolbit_fan")).rpc("decline_revgift", { p_order_no: share.orderNo })).error).toBeNull();
    expect(await cards("byeolbit_fan", [share.orderNo])).toEqual([]);
  });
});
