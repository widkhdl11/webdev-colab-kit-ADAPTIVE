import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, payTestOrder, psql, registerTestOrder, SEED, signedInClient } from "./helpers";
import { approve, deleteTestUnmatched, FAN_PASS, fanSetsWaybill, finishPrint, inspect, paidGift, receiveAndLabel, waybill } from "./office-helpers";

// 크리에이터가 받은 선물의 진행 단계 읽기 (office-workflow INV-W9, S9·S9b).
// 함수는 인자를 받지 않고 로그인 토큰의 크리에이터에게 온 주문만, 정해진 칸만 돌려준다. 결제 대기 주문은 없다.

type Row = {
  order_no: string;
  sender_nickname: string;
  box_count: number;
  stage: string;
  paid_at: string;
  received_at: string | null;
  inspected_at: string | null;
  shipped_at: string | null;
  inspection_result: string | null;
  delivery: string | null;
};

const KEYS = [
  "box_count",
  "delivery",
  "inspected_at",
  "inspection_result",
  "order_no",
  "paid_at",
  "received_at",
  "sender_nickname",
  "shipped_at",
  "stage",
];

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
});

async function readAs(login: string): Promise<Row[]> {
  const client = await signedInClient(login);
  const { data, error } = await client.rpc("my_incoming_gifts");
  expect(error).toBeNull();
  return data as Row[];
}

const pick = (rows: Row[], orderNo: string) => rows.find((r) => r.order_no === orderNo);

/** 별빛 → 하루, 입고·라벨 부착까지. 원 송장번호도 돌려준다(응답에 없어야 하는 값). */
async function receivedGift() {
  const g = await paidGift();
  const no = waybill();
  await fanSetsWaybill(g.boxIds[0]!, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  return { g, staff, qr, inboundNo: no };
}

async function inspectedGift() {
  const r = await receivedGift();
  await inspect(r.staff, r.qr, FAN_PASS);
  return r;
}

async function shippedGift() {
  const r = await inspectedGift();
  await approve(r.g);
  const out = waybill();
  const printed = finishPrint(r.qr, out);
  if (printed) throw new Error(`finishPrint 실패: ${printed}`);
  const shipped = await r.staff.rpc("office_confirm_shipment", { p_qr: r.qr, p_waybill: out });
  if (shipped.error) throw new Error(`office_confirm_shipment 실패: ${shipped.error.code} ${shipped.error.message}`);
  return { ...r, outboundNo: out };
}

function momoCreatorId(): string {
  const id = psql("select id from public.creators where slug = 'momo'");
  if (!id) throw new Error("시드에 모모가 없다");
  return id;
}

describe("INV-W9: 크리에이터는 자기에게 온 주문의 진행 단계만 본다", () => {
  it("INV-W9 S9: 하루에게 온 입고·검수 완료·출고 주문 셋이 단계와 단계 시각이 맞게 나오고, 모모에게 온 주문은 없다", async () => {
    const a = await receivedGift();
    const b = await inspectedGift();
    const c = await shippedGift();
    const momo = await registerTestOrder(1, { creatorId: momoCreatorId() });
    await payTestOrder(momo);

    const rows = await readAs("haru_creator");
    const ra = pick(rows, a.g.orderNo);
    const rb = pick(rows, b.g.orderNo);
    const rc = pick(rows, c.g.orderNo);
    expect(pick(rows, momo.orderNo)).toBeUndefined();

    expect(ra?.stage).toBe("received");
    expect(ra?.received_at).not.toBeNull();
    expect(ra?.inspected_at).toBeNull();
    expect(ra?.shipped_at).toBeNull();
    expect(ra?.inspection_result).toBeNull();

    expect(rb?.stage).toBe("inspected");
    expect(rb?.received_at).not.toBeNull();
    expect(rb?.inspected_at).not.toBeNull();
    expect(rb?.shipped_at).toBeNull();
    expect(rb?.inspection_result).toBe("passed");

    expect(rc?.stage).toBe("shipped");
    expect(rc?.shipped_at).not.toBeNull();
    expect(rc?.inspection_result).toBe("passed");

    // 결제 완료 시각은 등록 시각이고 셋 모두 있다
    for (const r of [ra, rb, rc]) {
      const registeredMs = Number(psql(`select floor(extract(epoch from registered_at) * 1000) from public.orders where order_no = '${r?.order_no}'`));
      expect(Math.floor(Date.parse(r?.paid_at ?? ""))).toBe(registeredMs);
      expect(r?.box_count).toBe(1);
    }
    // 모모는 하루의 주문을 보지 않고 자기 주문을 본다
    const momoRows = await readAs("momo_creator");
    expect(pick(momoRows, a.g.orderNo)).toBeUndefined();
    expect(pick(momoRows, momo.orderNo)?.stage).toBe("paid");
  });

  it("INV-W9 S9: 배송 칸은 주문의 배송 값을 따른다(시드 FC-7K3M9 배송중·FC-A1B2C 수령)", async () => {
    const rows = await readAs("haru_creator");
    expect(pick(rows, "FC-7K3M9")).toMatchObject({ stage: "in_transit", delivery: "in_transit" });
    expect(pick(rows, "FC-A1B2C")).toMatchObject({ stage: "delivered", delivery: "delivered" });
  });

  it("INV-W9: 추적 장치가 나와 보관한 상자는 검수 결과가 「보관」이다(통과로 보이지 않는다)", async () => {
    const r = await receivedGift();
    await inspect(r.staff, r.qr, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" });
    const row = pick(await readAs("haru_creator"), r.g.orderNo);
    expect(row?.inspection_result).toBe("held");
    expect(row?.inspected_at).not.toBeNull();
  });

  it("INV-W9 (실패경로): 검수에서 반송된 상자는 검수 결과가 「반송」이다", async () => {
    const r = await receivedGift();
    await inspect(r.staff, r.qr, { bluetooth: "clear", rf: "clear", metal: "clear", outcome: "return" });
    const row = pick(await readAs("haru_creator"), r.g.orderNo);
    expect(row?.inspection_result).toBe("returned");
    expect(row?.stage).toBe("returned");
  });

  it("INV-W9 S9b (실패경로): 하루에게 온 결제 대기 주문은 나오지 않는다", async () => {
    const pending = await registerTestOrder();
    const rows = await readAs("haru_creator");
    expect(pick(rows, pending.orderNo)).toBeUndefined();
    // 같은 주문이 결제를 마치면 나온다(조건이 없어서 안 나온 것이 아니다)
    await payTestOrder(pending);
    expect(pick(await readAs("haru_creator"), pending.orderNo)?.stage).toBe("paid");
  });

  it("INV-W9 S9b (실패경로): 팬·운영자로 읽으면 0줄, 로그인하지 않으면 줄을 받지 못한다", async () => {
    await inspectedGift();
    expect(await readAs("byeolbit_fan")).toEqual([]);
    expect(await readAs("fankkuk_admin")).toEqual([]);
    expect(await readAs("fankkuk_staff")).toEqual([]);
    const anon = await anonClient().rpc("my_incoming_gifts");
    expect(anon.data ?? []).toEqual([]);
  });

  it("INV-W9 S9b (실패경로): 팬 계정에 크리에이터 줄을 붙여도 그 팬으로 읽으면 0줄 — 역할이 크리에이터여야 한다", async () => {
    // 달토끼(팬) 계정을 가리키는 크리에이터 줄을 시험용으로 만들고 그 크리에이터에게 결제까지 끝낸 주문을 보낸다
    const fakeCreatorId = "00000000-0000-4000-b000-0000000009a9";
    psql(
      `begin; set local session_replication_role = replica; insert into public.creators (id, profile_id, slug, name, channel, identity_verified) values ('${fakeCreatorId}', '${SEED.otherFanId}', 'w9-fan-attached', '시험붙임', 'https://www.youtube.com/@w9fanattached', true); commit;`,
    );
    try {
      const o = await registerTestOrder(1, { creatorId: fakeCreatorId });
      await payTestOrder(o);
      // 그 크리에이터에게 온 결제 완료 주문은 있다(줄이 없어서 0줄인 것이 아니다)
      expect(psql(`select count(*) from public.orders where id = '${o.orderId}' and creator_id = '${fakeCreatorId}' and registered_at is not null`)).toBe("1");
      expect(await readAs("daltokki_fan")).toEqual([]);
    } finally {
      psql(`delete from public.notification_outbox where order_id in (select id from public.orders where creator_id = '${fakeCreatorId}')`);
      deleteTestOrders();
      psql(`begin; set local session_replication_role = replica; delete from public.creators where id = '${fakeCreatorId}'; commit;`);
    }
  });

  it("INV-W9 (실패경로): 크리에이터 ID 를 인자로 넘기면 함수를 찾지 못해 거부된다", async () => {
    const haru = await signedInClient("haru_creator");
    const r = await haru.rpc("my_incoming_gifts", { p_creator_id: momoCreatorId() });
    expect(r.error).not.toBeNull();
    expect(r.data).toBeNull();
  });

  it("INV-W9: 칸은 정해진 열 개뿐이고 보낸 사람 계정·원 송장번호·출고 송장번호·처리한 운영자가 없다", async () => {
    const c = await shippedGift();
    const rows = await readAs("haru_creator");
    expect(rows.length).toBeGreaterThan(0);
    const staffId = psql("select id from public.profiles where login_id = 'fankkuk_staff'");
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(KEYS);
      const text = JSON.stringify(r);
      for (const leak of [SEED.fanId, "byeolbit_fan", c.inboundNo, c.outboundNo, staffId, "fankkuk_staff", "584012376655", "612345678901"]) {
        expect(text).not.toContain(leak);
      }
    }
    const nickname = psql(`select nickname from public.profiles where id = '${SEED.fanId}'`);
    expect(pick(rows, c.g.orderNo)?.sender_nickname).toBe(nickname);
  });
});
