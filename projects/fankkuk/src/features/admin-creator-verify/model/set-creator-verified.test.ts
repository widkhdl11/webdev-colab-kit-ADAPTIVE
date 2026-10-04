import { describe, expect, it } from "vitest";
import { setCreatorVerified } from "./set-creator-verified";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

type Who = { operator: boolean; owner: boolean };

function fakeClient(error: { code: string } | null, who: Who = { operator: true, owner: false }) {
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

describe("크리에이터 본인 확인 승인·취소 (INV-K10)", () => {
  it("INV-K10: 직원 운영자도 승인한다 — DB 함수에 그대로 넘기고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await setCreatorVerified(client, { creatorId: ID, verified: true, reason: "" })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_set_creator_verified", args: { p_creator_id: ID, p_verified: true, p_reason: "" } }]);
  });

  it("INV-K10 S10: 승인 취소는 사유(앞뒤 공백 뗌)와 함께 간다", async () => {
    const { calls, client } = fakeClient(null);
    expect((await setCreatorVerified(client, { creatorId: ID, verified: false, reason: "  코드가 사라짐 " })).status).toBe(200);
    expect(calls).toEqual([{ fn: "admin_set_creator_verified", args: { p_creator_id: ID, p_verified: false, p_reason: "코드가 사라짐" } }]);
  });

  it("INV-K10 (실패경로): 운영자가 아니면 404 — DB 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient(null, { operator: false, owner: false });
    expect(await setCreatorVerified(client, { creatorId: ID, verified: true, reason: "" })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-K10 (실패경로): 꼴이 틀리거나 사유가 200자를 넘으면 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      null,
      { creatorId: ID, verified: true },
      { creatorId: ID, verified: "true", reason: "" },
      { creatorId: "x", verified: true, reason: "" },
      { creatorId: "", verified: true, reason: "" }, // 빈 id
      { creatorId: ID, verified: false, reason: "가".repeat(201) },
      { creatorId: ID, verified: false, reason: "", extra: 1 },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient(null);
      expect((await setCreatorVerified(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-K10: 사유 200자는 받는다", async () => {
    const { calls, client } = fakeClient(null);
    expect((await setCreatorVerified(client, { creatorId: ID, verified: false, reason: "가".repeat(200) })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("INV-K10 (실패경로): 이미 그 상태(55000)면 409 「이미 처리됐어요. 새로 고침해 주세요.」, 42501→403, P0002→404, 22023→400", async () => {
    const already = fakeClient({ code: "55000" });
    expect(await setCreatorVerified(already.client, { creatorId: ID, verified: true, reason: "" })).toEqual({
      status: 409,
      body: { message: "이미 처리됐어요. 새로 고침해 주세요." },
    });
    for (const [code, status] of [
      ["42501", 403],
      ["P0002", 404],
      ["22023", 400],
      ["XX000", 500],
    ] as const) {
      const { client } = fakeClient({ code });
      expect((await setCreatorVerified(client, { creatorId: ID, verified: true, reason: "" })).status).toBe(status);
    }
  });
});
