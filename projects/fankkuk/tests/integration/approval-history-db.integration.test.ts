import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED, deleteTestFollows, deleteTestOrders, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";

// 승인 요청 카드의 지난 검수 내역(decline-block INV-D11, 카드 d80 「나에게 보낸 것만」).
// 하루 = haru_creator · 모모 = momo_creator · 보낸 사람 = 하늘(haneul_fan — 시드 주문은 모모에게 출고·검수 통과된 한 건뿐) ·
// 다른 팬 = 솜사탕(시드 주문은 하루에게 출고된 한 건뿐).

const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const SENDER = "00000000-0000-4000-a000-000000000005"; // 하늘
const OTHER = "00000000-0000-4000-a000-000000000004"; // 솜사탕

type Row = {
  order_no: string;
  prior_gift_count: number;
  prior_passed_count: number;
  prior_returned_count: number;
};

let haru: SupabaseClient;
let momo: SupabaseClient;

beforeAll(async () => {
  haru = await signedInClient("haru_creator");
  momo = await signedInClient("momo_creator");
});

afterAll(() => {
  deleteTestOrders();
  deleteTestFollows();
});

async function paidGift(who: { senderId: string; creatorId?: string }) {
  const o = await registerTestOrder(1, who);
  await payTestOrder(o);
  return o;
}

function setInspection(orderId: string, result: "passed" | "returned"): void {
  psql(`update public.orders set inspection_result = '${result}', inspected_at = now() where id = '${orderId}'`);
}

async function rows(client: SupabaseClient): Promise<Row[]> {
  const r = await client.rpc("my_approval_requests");
  if (r.error) throw new Error(`my_approval_requests 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Row[];
}

function pick(list: Row[], orderNo: string): Pick<Row, "prior_gift_count" | "prior_passed_count" | "prior_returned_count"> | undefined {
  const row = list.find((x) => x.order_no === orderNo);
  if (!row) return undefined;
  return { prior_gift_count: row.prior_gift_count, prior_passed_count: row.prior_passed_count, prior_returned_count: row.prior_returned_count };
}

describe("승인 요청 카드의 지난 검수 내역 (INV-D11)", () => {
  it("INV-D11 (S11b): 처음 보내는 팬 — 다른 크리에이터(모모)에게 검수 통과한 주문이 있어도 하루 카드에는 0건", async () => {
    const now = await paidGift({ senderId: SENDER });
    expect(pick(await rows(haru), now.orderNo)).toEqual({ prior_gift_count: 0, prior_passed_count: 0, prior_returned_count: 0 });
    deleteTestOrders();
  });

  it("INV-D11 (S11·S11c·S11e): 같은 팬·같은 크리에이터 주문만 센다 — 지금 요청·다른 크리에이터·다른 팬 주문은 빠진다", async () => {
    const now = await paidGift({ senderId: SENDER });
    const passed = await paidGift({ senderId: SENDER });
    setInspection(passed.orderId, "passed");
    const returned = await paidGift({ senderId: SENDER });
    setInspection(returned.orderId, "returned");
    // 실패경로: 모모에게 보낸 반송 주문, 다른 팬이 하루에게 보낸 반송 주문
    const toMomo = await paidGift({ senderId: SENDER, creatorId: MOMO_CREATOR_ID });
    setInspection(toMomo.orderId, "returned");
    const otherFan = await paidGift({ senderId: OTHER });
    setInspection(otherFan.orderId, "returned");

    const list = await rows(haru);
    expect(pick(list, now.orderNo)).toEqual({ prior_gift_count: 2, prior_passed_count: 1, prior_returned_count: 1 });
    // 검수 통과한 주문의 카드도 자기 자신은 세지 않는다 — 지금 요청 + 반송 1
    expect(pick(list, passed.orderNo)).toEqual({ prior_gift_count: 2, prior_passed_count: 0, prior_returned_count: 1 });
    // 개별 주문 칸(주문번호·날짜·품목)은 지난 내역으로 오지 않는다 — 칸 목록 고정
    expect(Object.keys(list.find((x) => x.order_no === now.orderNo) ?? {}).sort()).toEqual(
      [
        "box_count",
        "fan_nickname",
        "has_electronics_or_metal",
        "item_kind",
        "order_no",
        "prior_gift_count",
        "prior_passed_count",
        "prior_returned_count",
        "received_at",
        "registered_at",
        "request_id",
      ].sort(),
    );

    // S11d: 모모 계정은 하루에게 온 요청을 못 보고, 모모에게 온 하늘의 반송 주문 카드에는 하루 쪽 주문이 세지지 않는다
    // (하늘 → 모모: 시드 FC-M3N4P 검수 통과 1건뿐. toMomo 는 반송이라 대기 목록에서 빠지므로 새 대기 주문으로 본다)
    const momoNow = await paidGift({ senderId: SENDER, creatorId: MOMO_CREATOR_ID });
    const momoList = await rows(momo);
    expect(momoList.map((x) => x.order_no)).not.toContain(now.orderNo);
    expect(momoList.map((x) => x.order_no)).not.toContain(passed.orderNo);
    expect(pick(momoList, momoNow.orderNo)).toEqual({ prior_gift_count: 2, prior_passed_count: 1, prior_returned_count: 1 });
    deleteTestOrders();
  });

  it("INV-D11 (실패경로): 결제 전 주문은 세지 않는다 — 결제가 끝난 주문만 지난 선물이다", async () => {
    const now = await paidGift({ senderId: SENDER });
    // 결제창을 닫아 결제 전으로 남은 주문 둘. 하나는 등록 시각이 비어 있는 보통 모양,
    // 다른 하나는 등록 시각이 찍혀 있어 「결제 전 상태」 조건만이 걸러 내는 모양이다(시각 조건이 대신 막지 못하게).
    const unpaid = await registerTestOrder(1, { senderId: SENDER });
    const unpaidStamped = await registerTestOrder(1, { senderId: SENDER });
    psql(`update public.orders set registered_at = now() where id = '${unpaidStamped.orderId}'`);
    expect(psql(`select string_agg(status::text, ',' order by status::text) from public.orders where id in ('${unpaid.orderId}', '${unpaidStamped.orderId}')`)).toBe(
      "pending_payment,pending_payment",
    );
    // 맞는 쪽: 결제가 끝난 지난 주문 하나는 센다
    const paidBefore = await paidGift({ senderId: SENDER });
    setInspection(paidBefore.orderId, "passed");

    expect(pick(await rows(haru), now.orderNo)).toEqual({ prior_gift_count: 1, prior_passed_count: 1, prior_returned_count: 0 });
    deleteTestOrders();
  });

  it("INV-D11 (S11d, 실패경로): 팬 계정이 부르면 0줄", async () => {
    await paidGift({ senderId: SENDER });
    const fan = await signedInClient("haneul_fan");
    const r = await fan.rpc("my_approval_requests");
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
    deleteTestOrders();
  });
});
