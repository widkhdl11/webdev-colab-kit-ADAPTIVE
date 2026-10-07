import { describe, expect, it } from "vitest";
import { MESSAGE_ALREADY_CLOSED, returnHeld } from "./return-held";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

/** 로그인한 사람의 세션 클라이언트 대역. 판정 함수(is_operator·is_owner)는 who 로, 쓰기 함수는 reply 로 답한다. */
function fakeClient(reply: { error: { code: string } | null }, operator = true) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: operator, error: null };
      if (fn === "is_owner") return { data: false, error: null };
      calls.push({ fn, args });
      return { data: null, error: reply.error };
    },
  } as never;
  return { calls, client };
}

describe("반송으로 넘기기 (inbound-address-code INV-C6·C9)", () => {
  it("INV-C9: 운영자가 보류 줄 id 하나로 DB 함수를 부른다", async () => {
    const { calls, client } = fakeClient({ error: null });
    expect(await returnHeld(client, { kind: "return", id: ID })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_return_unmatched", args: { p_id: ID } }]);
  });

  it("INV-C4·C9 (실패경로): 주문번호·상자 칸을 붙이거나 꼴이 틀리면 DB 를 부르지 않고 400 — 손으로 잇는 길은 없다", async () => {
    for (const body of [null, { kind: "return" }, { kind: "return", id: "x" }, { kind: "return", id: ID, orderNo: "FC-1" }, { kind: "match", id: ID, boxId: ID }]) {
      const { calls, client } = fakeClient({ error: null });
      expect((await returnHeld(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-C9 (실패경로): 운영자가 아니면 404 — 쓰기 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({ error: null }, false);
    expect((await returnHeld(client, { kind: "return", id: ID })).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("INV-C9 (실패경로): 이미 이어졌거나 반송 대상(55000)이면 409, 없는 줄은 404", async () => {
    expect(await returnHeld(fakeClient({ error: { code: "55000" } }).client, { kind: "return", id: ID })).toEqual({ status: 409, body: { message: MESSAGE_ALREADY_CLOSED } });
    expect((await returnHeld(fakeClient({ error: { code: "P0002" } }).client, { kind: "return", id: ID })).status).toBe(404);
  });
});
