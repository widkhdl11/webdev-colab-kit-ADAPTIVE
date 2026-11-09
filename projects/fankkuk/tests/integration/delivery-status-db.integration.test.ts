import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { linkClient, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { FAN_X, giftBoxes } from "./gift-reply-helpers";
import { anonClient, deleteTestOrders, holdRowLock, psql } from "./helpers";
import { PROFILE } from "./revgift-helpers";

// 배송 현황 표시 — 웹훅 연결 전(docs/specs/delivery-status.md INV-DS2·DS3·DS5·DS6) 중 DB 가 지키는 것.
// ① 팬 선물: 팬·크리에이터 읽기 함수 어디에도 크리에이터행 출고 송장번호가 없다(INV-DS3). 같은 응답에 출고 날짜는 있다 — 찾는 방법이 동작하는지 같이 본다.
// ② 선물함: 받는 팬의 [받았어요](revgift_box_fan_received) — 본인 신청만·출고 뒤에만·한 번만(INV-DS2·DS6), 신청 상태는 그대로(INV-DS5),
//    팬·크리에이터 읽기에 팬에게 가는 송장번호가 없다(INV-DS3). 선물함·신청 줄은 psql 로 바로 넣는다.

const A = CV.haru;
const HARU_CREATOR = "00000000-0000-4000-b000-000000000001";
const OUT_WAYBILL = "771099887766";

function deleteBoxes(): void {
  psql(`delete from public.revgift_boxes where creator_id = '${HARU_CREATOR}' and name = '배송 시험 선물함'`);
}

beforeAll(() => {
  createCvAccounts();
});
beforeEach(() => {
  deleteTestOrders();
  deleteBoxes();
  resetCv();
  verifyCreator(A.creatorId, "cvt-delivery-a");
});
afterAll(() => {
  deleteTestOrders();
  deleteBoxes();
  dropCvAccounts();
});

describe("INV-DS3: 팬 선물 — 크리에이터행 송장번호는 팬·크리에이터 읽기 어디에도 없다", () => {
  it("INV-DS3: 출고된 상자(사무실 상자·주문 둘 다 출고 송장번호 있음) — 팬 목록·팬 상자별 받았어요·크리에이터 받은 선물에 그 번호가 없고 출고 날짜는 있다", async () => {
    const [box] = giftBoxes(FAN_X.id, A.creatorId, 1);
    const waybill = psql(`select outbound_waybill_no from public.office_parcels where id = '${box!.parcelId}'`);
    expect(waybill).toMatch(/^\d{10,14}$/);
    psql(`begin; set local session_replication_role = replica; update public.orders set outbound_waybill_no = '${waybill}' where id = '${box!.orderId}'; commit;`);

    const fan = await linkClient(FAN_X.login);
    const creator = await linkClient(A.login);
    const reads = {
      my_gifts: (await fan.rpc("my_gifts")).data,
      my_gift_replies: (await fan.rpc("my_gift_replies", { p_order_no: box!.orderNo, p_creator_id: null })).data,
      my_received_boxes: (await creator.rpc("my_received_boxes")).data,
      my_gift_progress: (await creator.rpc("my_gift_progress")).data,
    };
    for (const [name, data] of Object.entries(reads)) {
      expect(data, name).not.toBeNull();
      expect(JSON.stringify(data), name).not.toContain(waybill);
    }
    // 같은 응답에서 출고 날짜는 찾힌다 — 찾는 방법(문자열 포함)이 동작한다
    const shippedOn = psql(`select to_char((shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') from public.office_parcels where id = '${box!.parcelId}'`);
    expect(JSON.stringify(reads.my_received_boxes)).toContain(shippedOn);
  });
});

/** 하루의 선물함 하나와 별빛의 신청(상태 status). printed/shipped 면 송장 출력·출고 시각과 팬에게 가는 송장번호를 같이 넣는다 */
function boxWithApp(status: "paid" | "shipped", o: { printed?: boolean; shippedDaysAgo?: number } = {}): { boxId: string; appId: string } {
  const boxId = psql(
    `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${PROFILE.haru}', '${HARU_CREATOR}', '배송 시험 선물함', 10, true, 'paid') returning id`,
  ).split("\n")[0]!;
  const printed = o.printed ?? true;
  const shippedAt = status === "shipped" ? `now() - interval '1 day' * ${o.shippedDaysAgo ?? 0}` : "null";
  const appId = psql(
    `insert into public.revgift_box_applications (box_id, fan_id, status, chosen_tier, printed_at, shipped_at, outbound_waybill_no)
     values ('${boxId}', '${PROFILE.byeolbit}', '${status}', 'small', ${printed ? "now() - interval '5 days'" : "null"}, ${shippedAt}, ${printed ? `'${OUT_WAYBILL}'` : "null"}) returning id`,
  ).split("\n")[0]!;
  return { boxId, appId };
}
const receivedAt = (appId: string) => psql(`select coalesce(fan_received_at::text, '') from public.revgift_box_applications where id = '${appId}'`);
const appStatus = (appId: string) => psql(`select status from public.revgift_box_applications where id = '${appId}'`);

describe("INV-DS2·DS6: 선물함 — 받는 팬의 [받았어요]", () => {
  it("INV-DS6 (실패경로): 신청하지 않은 팬·크리에이터·로그인 안 함은 남길 수 없고 아무것도 남지 않는다", async () => {
    const { boxId, appId } = boxWithApp("shipped");
    expect((await (await linkClient("daltokki_fan")).rpc("revgift_box_fan_received", { p_box_id: boxId })).error?.code).toBe("P0002");
    expect((await (await linkClient("haru_creator")).rpc("revgift_box_fan_received", { p_box_id: boxId })).error?.code).toBe("P0002");
    expect((await anonClient().rpc("revgift_box_fan_received", { p_box_id: boxId })).error).not.toBeNull();
    expect(receivedAt(appId)).toBe("");
  });

  it("INV-DS2 (실패경로): 출고 전(송장만 출력)에는 남길 수 없다", async () => {
    const { boxId, appId } = boxWithApp("paid");
    expect((await (await linkClient(FAN_X.login)).rpc("revgift_box_fan_received", { p_box_id: boxId })).error?.code).toBe("P0022");
    expect(receivedAt(appId)).toBe("");
  });

  it("INV-DS2·DS5: 출고 뒤 본인이 누르면 처음 한 번만 남고(두 번째는 false, 시각 그대로), 신청 상태는 shipped 그대로", async () => {
    const { boxId, appId } = boxWithApp("shipped");
    const fan = await linkClient(FAN_X.login);
    expect((await fan.rpc("revgift_box_fan_received", { p_box_id: boxId })).data).toBe(true);
    const first = receivedAt(appId);
    expect(first).not.toBe("");
    expect((await fan.rpc("revgift_box_fan_received", { p_box_id: boxId })).data).toBe(false);
    expect(receivedAt(appId)).toBe(first);
    expect(appStatus(appId)).toBe("shipped");
  });

  it("INV-DS2: 동시에 두 번 눌러도 처음으로 남긴 것은 하나(true 한 번) — 신청 줄 잠금 뒤에 두 요청을 줄 세워 확실히 겹치게", async () => {
    const { boxId, appId } = boxWithApp("shipped");
    const [c1, c2] = await Promise.all([linkClient(FAN_X.login), linkClient(FAN_X.login)]);
    const held = await holdRowLock(`select 1 from public.revgift_box_applications where id = '${appId}' for update`, 1.5);
    const results = await Promise.all([c1.rpc("revgift_box_fan_received", { p_box_id: boxId }), c2.rpc("revgift_box_fan_received", { p_box_id: boxId })]);
    await held.released;
    expect(results.map((r) => r.data).sort()).toEqual([false, true]);
  });
});

describe("INV-DS3·DS6: 선물함 읽기 — 배송 재료만, 송장번호 없음", () => {
  it("INV-DS6: 팬이 보는 선물함 — 송장 출력 뒤에만 delivery, 출고 날(서울)·받았어요·버튼 여부. 송장번호 없음", async () => {
    const fan = await linkClient(FAN_X.login);
    const before = boxWithApp("paid", { printed: false });
    expect(((await fan.rpc("revgift_box_for_fan", { p_box_id: before.boxId, p_token: null })).data as { delivery: unknown }).delivery).toBeNull();

    const printed = boxWithApp("paid");
    expect(((await fan.rpc("revgift_box_for_fan", { p_box_id: printed.boxId, p_token: null })).data as { delivery: unknown }).delivery).toEqual({
      shipped_on: null,
      received: false,
      can_confirm: false,
    });

    const shipped = boxWithApp("shipped", { shippedDaysAgo: 2 });
    const seen = (await fan.rpc("revgift_box_for_fan", { p_box_id: shipped.boxId, p_token: null })).data;
    const day = psql(`select to_char((shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') from public.revgift_box_applications where id = '${shipped.appId}'`);
    expect((seen as { delivery: unknown }).delivery).toEqual({ shipped_on: day, received: false, can_confirm: true });
    expect(JSON.stringify(seen)).not.toContain(OUT_WAYBILL);
  });

  it("INV-DS3: 크리에이터의 선물함 — 명세서 줄에 배송 재료(출고 날·받았어요)는 있고 팬에게 가는 송장번호는 없다", async () => {
    const { boxId, appId } = boxWithApp("shipped", { shippedDaysAgo: 1 });
    // 명세서 하나와 그 줄 — 1부 명세서 쓰기 함수는 실측 신청만 받으므로 줄을 실측 상태로 잠시 돌렸다가 출고로 되돌린다
    psql(`update public.revgift_box_applications set status = 'measured', measured_tier = 'small', measured_size_cm = 90, measured_weight_kg = 3, measured_at = now() where id = '${appId}'`);
    psql(`select public.revgift_box_write_invoice('${boxId}', '${JSON.stringify([{ application_id: appId, tier: "small", region: "none" }])}'::jsonb, now())`);
    psql(`update public.revgift_box_applications set status = 'shipped' where id = '${appId}'`);
    psql(`update public.revgift_box_applications set fan_received_at = now() where id = '${appId}'`);
    const mine = (await (await linkClient("haru_creator")).rpc("my_revgift_box", { p_box_id: boxId })).data as { invoice: { lines: Record<string, unknown>[] } };
    expect(mine.invoice.lines[0]).toMatchObject({ progress: "shipped", printed: true, received: true });
    expect(mine.invoice.lines[0]!.shipped_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(mine)).not.toContain(OUT_WAYBILL);
  });
});
