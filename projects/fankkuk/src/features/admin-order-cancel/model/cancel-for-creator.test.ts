import { describe, expect, it } from "vitest";
import { cancelForCreator } from "./cancel-for-creator";

// 크리에이터 사정으로 취소 (payment INV-M21). 대표 판정·주문 상태 판정·기록은 DB 함수가 최종으로 한다.
// 정해지지 않은 화면 문구 자리는 코드값(code)만 돌려준다 — 사유·주문번호 안내는 입고 뒤 취소와 같은 문구를 쓴다.

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

describe("INV-M21: 크리에이터 사정으로 취소", () => {
  it("INV-M21 (S21): 대표가 취소 — 사유 앞뒤 공백을 떼고 주문번호와 함께 DB 함수를 부르고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await cancelForCreator(client, { orderNo: "FC-7K3M9", reason: "  크리에이터 탈퇴 요청 " })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_cancel_for_creator", args: { p_order_no: "FC-7K3M9", p_reason: "크리에이터 탈퇴 요청" } }]);
  });

  it("INV-M21 (S21b, 실패경로): 운영자가 아니면 404, 직원 운영자는 403(owner_only) — 둘 다 DB 함수를 부르지 않는다", async () => {
    const guest = fakeClient(null, { operator: false, owner: false });
    expect(await cancelForCreator(guest.client, { orderNo: "FC-7K3M9", reason: "x" })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(guest.calls).toEqual([]);
    const staff = fakeClient(null, { operator: true, owner: false });
    expect(await cancelForCreator(staff.client, { orderNo: "FC-7K3M9", reason: "x" })).toEqual({ status: 403, body: { code: "owner_only" } });
    expect(staff.calls).toEqual([]);
  });

  it("INV-M21 (S21b, 실패경로): 사유 빈칸·공백만·201자, 모르는 칸은 DB 를 부르지 않고 사유 안내 400 · 주문번호 꼴이 틀리면 주문번호 안내", async () => {
    for (const body of [null, { orderNo: "FC-7K3M9", reason: "" }, { orderNo: "FC-7K3M9", reason: "  " }, { orderNo: "FC-7K3M9", reason: "가".repeat(201) }, { orderNo: "FC-7K3M9", reason: "x", refundKrw: 1 }]) {
      const { calls, client } = fakeClient(null);
      expect(await cancelForCreator(client, body)).toEqual(REASON_REPLY);
      expect(calls).toEqual([]);
    }
    for (const body of [{ orderNo: "fc-7k3m9", reason: "x" }, { reason: "x" }]) {
      const { calls, client } = fakeClient(null);
      expect(await cancelForCreator(client, body)).toEqual(ORDER_NO_REPLY);
      expect(calls).toEqual([]);
    }
  });

  it("INV-M21 (S21b, 실패경로): DB 거부 — 42501 은 403(owner_only), P0002 는 409(not_cancelable), 22023 은 사유 안내", async () => {
    expect(await cancelForCreator(fakeClient({ code: "42501" }).client, { orderNo: "FC-7K3M9", reason: "x" })).toEqual({ status: 403, body: { code: "owner_only" } });
    expect(await cancelForCreator(fakeClient({ code: "P0002" }).client, { orderNo: "FC-7K3M9", reason: "x" })).toEqual({ status: 409, body: { code: "not_cancelable" } });
    expect(await cancelForCreator(fakeClient({ code: "22023" }).client, { orderNo: "FC-7K3M9", reason: "x" })).toEqual(REASON_REPLY);
  });
});
