import { describe, expect, it } from "vitest";
import { cancelReceivedGift } from "./cancel-received-gift";

// 대표의 입고 뒤 취소 (payment INV-M17). 대표 판정·주문 상태 판정·기록은 DB 함수가 최종으로 한다.

type Who = { operator: boolean; owner: boolean };

function fakeClient(error: { code: string } | null, who: Who = { operator: true, owner: true }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      return { data: null, error };
    },
  } as never;
  return { calls, client };
}

const REASON_REPLY = { status: 400, body: { message: "사유를 1~200자로 적어 주세요." } };
const ORDER_NO_REPLY = { status: 400, body: { message: "주문번호를 FC-7K3M9 꼴 그대로 적어 주세요." } };

describe("INV-M17: 대표의 입고 뒤 취소", () => {
  it("INV-M17 (S17): 대표가 취소 — 사유 앞뒤 공백을 떼고 주문번호와 함께 DB 함수를 부르고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await cancelReceivedGift(client, { orderNo: "FC-7K3M9", reason: "  1:1 문의로 취소 요청 " })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_cancel_received_gift", args: { p_order_no: "FC-7K3M9", p_reason: "1:1 문의로 취소 요청" } }]);
  });

  it("INV-M17: 사유 200자·번호 붙은 주문번호는 받는다", async () => {
    const { calls, client } = fakeClient(null);
    expect((await cancelReceivedGift(client, { orderNo: "FC-7K3M9-2", reason: "가".repeat(200) })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("INV-M17 (S17b, 실패경로): 운영자가 아니면 404, 직원 운영자는 403 — 둘 다 DB 함수를 부르지 않는다", async () => {
    const guest = fakeClient(null, { operator: false, owner: false });
    expect(await cancelReceivedGift(guest.client, { orderNo: "FC-7K3M9", reason: "x" })).toEqual({ status: 404, body: { message: "요청한 항목을 찾을 수 없습니다." } });
    expect(guest.calls).toEqual([]);
    const staff = fakeClient(null, { operator: true, owner: false });
    expect(await cancelReceivedGift(staff.client, { orderNo: "FC-7K3M9", reason: "x" })).toEqual({ status: 403, body: { message: "입고 뒤 취소는 대표만 할 수 있어요." } });
    expect(staff.calls).toEqual([]);
  });

  it("INV-M17 (S17b, 실패경로): 사유 빈칸·공백만·201자, 꼴이 틀린 몸통은 DB 를 부르지 않고 사유 안내 400", async () => {
    const bad: unknown[] = [
      null,
      { orderNo: "FC-7K3M9", reason: "" },
      { orderNo: "FC-7K3M9", reason: "   " },
      { orderNo: "FC-7K3M9", reason: "가".repeat(201) },
      { orderNo: "FC-7K3M9" },
      { orderNo: "FC-7K3M9", reason: "x", refundKrw: 1000 },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient(null);
      expect(await cancelReceivedGift(client, body)).toEqual(REASON_REPLY);
      expect(calls).toEqual([]);
    }
  });

  it("INV-M17 (실패경로): 꼴이 틀린 주문번호는 DB 를 부르지 않고 주문번호 안내 400", async () => {
    for (const orderNo of ["fc-7k3m9", "FC-7K", "RV-AAAA1", "FC-7K3M9-123", ""]) {
      const { calls, client } = fakeClient(null);
      expect(await cancelReceivedGift(client, { orderNo, reason: "x" })).toEqual(ORDER_NO_REPLY);
      expect(calls).toEqual([]);
    }
  });

  it("INV-M17 (실패경로): 주문번호 칸이 빠지거나 문자열이 아니면 사유가 아니라 주문번호 안내 400", async () => {
    for (const body of [{ reason: "x" }, { orderNo: 123, reason: "x" }, { orderNo: null, reason: "x" }]) {
      const { calls, client } = fakeClient(null);
      expect(await cancelReceivedGift(client, body)).toEqual(ORDER_NO_REPLY);
      expect(calls).toEqual([]);
    }
  });

  it("INV-M17 (S17b, 실패경로): DB 오류 — P0002·P0061(S17c) 409, 22023 사유 400, 42501 대표 문구 403, 그 밖 500", async () => {
    const body = { orderNo: "FC-7K3M9", reason: "x" };
    expect(await cancelReceivedGift(fakeClient({ code: "P0002" }).client, body)).toEqual({
      status: 409,
      body: { message: "입고 뒤 취소를 할 수 있는 주문이 아니에요. 상자가 도착했는지, 송장을 출력하지 않았는지 확인해 주세요." },
    });
    expect(await cancelReceivedGift(fakeClient({ code: "P0061" }).client, body)).toEqual({
      status: 409,
      body: { message: "검수에서 걸린 상자가 있어 취소할 수 없어요. 이 주문은 검수 불합격 반송으로 처리돼요." },
    });
    expect(await cancelReceivedGift(fakeClient({ code: "22023" }).client, body)).toEqual(REASON_REPLY);
    expect(await cancelReceivedGift(fakeClient({ code: "42501" }).client, body)).toEqual({ status: 403, body: { message: "입고 뒤 취소는 대표만 할 수 있어요." } });
    expect((await cancelReceivedGift(fakeClient({ code: "XX000" }).client, body)).status).toBe(500);
  });
});
