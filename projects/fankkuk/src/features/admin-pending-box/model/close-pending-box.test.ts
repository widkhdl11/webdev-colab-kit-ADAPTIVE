import { describe, expect, it } from "vitest";
import { closePendingBox } from "./close-pending-box";

// 거절·반려 때 아직 안 온 상자를 대표가 「도착하지 않음」으로 닫는다 (payment INV-M18). 대표 판정·대상 판정은 DB 함수가 최종으로 한다.

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

const BOX_ID = "6f1c2b0e-8a4d-4c1e-9b7a-1d2e3f4a5b6c";

describe("INV-M18: 대표의 안 온 상자 닫기", () => {
  it("INV-M18 (S18c): 대표가 닫음 — 상자 id 로 DB 함수를 부르고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await closePendingBox(client, { boxId: BOX_ID })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_close_pending_box", args: { p_box_id: BOX_ID } }]);
  });

  it("INV-M18 (S18d, 실패경로): 운영자가 아니면 404, 직원 운영자는 403 — DB 를 부르지 않는다", async () => {
    const guest = fakeClient(null, { operator: false, owner: false });
    expect(await closePendingBox(guest.client, { boxId: BOX_ID })).toEqual({ status: 404, body: { message: "요청한 항목을 찾을 수 없습니다." } });
    expect(guest.calls).toEqual([]);
    const staff = fakeClient(null, { operator: true, owner: false });
    expect(await closePendingBox(staff.client, { boxId: BOX_ID })).toEqual({ status: 403, body: { message: "도착하지 않은 상자는 대표만 닫을 수 있어요." } });
    expect(staff.calls).toEqual([]);
  });

  it("INV-M18 (실패경로): 꼴이 틀린 몸통은 DB 를 부르지 않고 400", async () => {
    for (const body of [null, {}, { boxId: "x" }, { boxId: BOX_ID, refundKrw: 6900 }]) {
      const { calls, client } = fakeClient(null);
      expect((await closePendingBox(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-M18 (S18d·S18e, 실패경로): DB 오류 — P0002 409(이미 도착·이미 닫힘), 42501 대표 문구 403, 그 밖 500", async () => {
    const body = { boxId: BOX_ID };
    expect(await closePendingBox(fakeClient({ code: "P0002" }).client, body)).toEqual({
      status: 409,
      body: { message: "닫을 수 있는 상자가 아니에요. 그 사이 상자가 도착했거나 이미 닫혔을 수 있어요." },
    });
    expect(await closePendingBox(fakeClient({ code: "42501" }).client, body)).toEqual({ status: 403, body: { message: "도착하지 않은 상자는 대표만 닫을 수 있어요." } });
    expect((await closePendingBox(fakeClient({ code: "XX000" }).client, body)).status).toBe(500);
  });
});
