import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, psql, registerTestOrder, signedInClient } from "./helpers";
import { approve, codeOf, paidGift } from "./office-helpers";

// 「먼저 보내기」 (approval-signature INV-S9 S9·S9c·S9d · inbound-address-code INV-C3, 2026-10-08 사용자 지시).
// 크리에이터가 아직 승인하지 않은 주문은 팬이 「먼저 보내기」(거절되면 반송될 수 있다는 안내)를 눌러야 받는 주소 6자리가 나온다.
// 누른 시각은 주문에 한 번 남고, 서버는 그 기록이 있거나 승인된 주문에만 6자리를 준다.

afterEach(() => {
  deleteTestOrders();
});

type BoxRow = { address_code: string | null; send_ack_needed: boolean };

async function boxesOf(login: string, orderNo: string): Promise<BoxRow[]> {
  const r = await (await signedInClient(login)).rpc("my_gift_boxes", { p_order_no: orderNo });
  if (r.error) throw new Error(`my_gift_boxes 실패: ${r.error.message}`);
  return r.data as BoxRow[];
}

const ackAt = (orderId: string) => psql(`select coalesce(fan_send_ack_at::text, '') from public.orders where id = '${orderId}'`);

describe("「먼저 보내기」 전에는 받는 주소가 나오지 않는다 (INV-S9)", () => {
  it("INV-S9·C3 (S9): 승인 전 주문은 누르기 전 6자리 없음·「먼저 보내기 전」 표시, 누른 뒤 6자리 — 두 번 눌러도 기록은 처음 시각", async () => {
    const g = await paidGift(2);
    const before = await boxesOf("byeolbit_fan", g.orderNo);
    expect(before).toHaveLength(2);
    expect(before.every((b) => b.address_code === null && b.send_ack_needed)).toBe(true);

    const fan = await signedInClient("byeolbit_fan");
    const first = await fan.rpc("ack_early_send", { p_order_no: g.orderNo });
    expect(first.error).toBeNull();
    const at = ackAt(g.orderId);
    expect(at).not.toBe("");

    const after = await boxesOf("byeolbit_fan", g.orderNo);
    expect(after.map((b) => b.address_code)).toEqual([codeOf({ boxId: g.boxIds[0]! }), codeOf({ boxId: g.boxIds[1]! })]);
    expect(after.every((b) => !b.send_ack_needed)).toBe(true);

    expect((await fan.rpc("ack_early_send", { p_order_no: g.orderNo })).error).toBeNull();
    expect(ackAt(g.orderId)).toBe(at);
  });

  it("INV-S9 (S9c): 크리에이터가 승인한 주문은 누르지 않아도 6자리가 나온다", async () => {
    const g = await paidGift(1);
    await approve(g);
    const rows = await boxesOf("byeolbit_fan", g.orderNo);
    expect(rows[0]!.address_code).toBe(codeOf({ boxId: g.boxIds[0]! }));
    expect(rows[0]!.send_ack_needed).toBe(false);
    expect(ackAt(g.orderId)).toBe("");
  });

  it("INV-S9 (S9d, 실패경로): 남의 주문·로그인 안 함은 누를 수 없고 기록이 남지 않는다", async () => {
    const g = await paidGift(1);
    for (const login of ["daltokki_fan", "haru_creator"]) {
      const r = await (await signedInClient(login)).rpc("ack_early_send", { p_order_no: g.orderNo });
      expect(r.error?.code).toBe("P0002");
    }
    const anon = await anonClient().rpc("ack_early_send", { p_order_no: g.orderNo });
    expect(anon.error).not.toBeNull();
    expect(ackAt(g.orderId)).toBe("");
    // 남이 눌렀다고 별빛의 6자리가 열리지 않는다
    expect((await boxesOf("byeolbit_fan", g.orderNo))[0]!.address_code).toBeNull();
  });

  it("INV-S9 (S9d, 실패경로): 결제 대기·거절·반려·취소된 주문은 누를 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const unpaid = await registerTestOrder(1);
    expect((await fan.rpc("ack_early_send", { p_order_no: unpaid.orderNo })).error?.code).toBe("P0002");
    expect(ackAt(unpaid.orderId)).toBe("");
    for (const status of ["rejected", "expired", "canceled"]) {
      const g = await paidGift(1);
      psql(`begin; set local session_replication_role = replica; update public.orders set status = '${status}' where id = '${g.orderId}'; commit;`);
      const r = await fan.rpc("ack_early_send", { p_order_no: g.orderNo });
      expect(r.error?.code).toBe("P0002");
      expect(ackAt(g.orderId)).toBe("");
    }
  });
});
