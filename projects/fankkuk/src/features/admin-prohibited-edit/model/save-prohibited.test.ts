import { describe, expect, it } from "vitest";
import { saveProhibited } from "./save-prohibited";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

type Who = { operator: boolean; owner: boolean };

/** 로그인한 사람의 세션 클라이언트 대역. 판정 함수(is_operator·is_owner)는 who 로, 쓰기 함수는 reply 로 답한다. */
function fakeClient(reply: { data?: unknown; error: { code: string } | null }, who: Who = { operator: true, owner: false }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { calls, client };
}

describe("보낼 수 없는 물품 저장 (INV-K9)", () => {
  it("INV-K9 S9: 직원 운영자도 추가한다 — 앞뒤 공백을 떼고 DB 추가 함수에 넘기고 200", async () => {
    const { calls, client } = fakeClient({ data: ID, error: null });
    const reply = await saveProhibited(client, { kind: "add", name: "  인화성 물질 ", description: " 불이 붙어요. " });
    expect(reply).toEqual({ status: 200, body: { ok: true, id: ID } });
    expect(calls).toEqual([{ fn: "admin_add_prohibited_item", args: { p_name: "인화성 물질", p_description: "불이 붙어요." } }]);
  });

  it("INV-K9: 고치기·지우기는 각각의 DB 함수로 간다", async () => {
    const edit = fakeClient({ error: null });
    expect((await saveProhibited(edit.client, { kind: "edit", id: ID, name: "칼", description: "" })).status).toBe(200);
    expect(edit.calls).toEqual([{ fn: "admin_edit_prohibited_item", args: { p_id: ID, p_name: "칼", p_description: "" } }]);
    const del = fakeClient({ error: null });
    expect((await saveProhibited(del.client, { kind: "delete", id: ID })).status).toBe(200);
    expect(del.calls).toEqual([{ fn: "admin_delete_prohibited_item", args: { p_id: ID } }]);
  });

  it("INV-K9 S9b (실패경로): 운영자가 아니면(손님·크리에이터) 404 — 쓰기 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({ error: null }, { operator: false, owner: false });
    expect(await saveProhibited(client, { kind: "add", name: "칼", description: "" })).toEqual({ status: 404, body: { message: "요청한 항목을 찾을 수 없습니다." } });
    expect(calls).toEqual([]);
  });

  it("INV-K9 (실패경로): 꼴이 틀리거나 글자 수를 넘긴 몸통은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      null,
      { kind: "add", name: "", description: "" },
      { kind: "add", name: "   ", description: "" },
      { kind: "add", name: "가".repeat(41), description: "" },
      { kind: "add", name: "칼", description: "가".repeat(121) },
      { kind: "add", name: "칼" },
      { kind: "add", name: "칼", description: "", id: ID }, // 모르는 칸
      { kind: "edit", id: "not-a-uuid", name: "칼", description: "" },
      { kind: "delete" },
      { kind: "delete", id: "" }, // 빈 id
      { kind: "rename", id: ID },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({ error: null });
      const reply = await saveProhibited(client, body);
      expect(reply.status).toBe(400);
      expect(reply.body.message).toBe("이름은 1~40자, 설명은 120자까지 적을 수 있어요.");
      expect(calls).toEqual([]);
    }
  });

  it("INV-K9: 경계값 — 이름 40자·설명 120자는 받는다", async () => {
    const { calls, client } = fakeClient({ data: ID, error: null });
    expect((await saveProhibited(client, { kind: "add", name: "가".repeat(40), description: "나".repeat(120) })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("INV-K9 (실패경로): DB 오류 코드를 상태로 옮긴다 — 42501→403, 22023→400, P0002→404, 그 밖→500", async () => {
    const cases: [string, number][] = [
      ["42501", 403],
      ["22023", 400],
      ["P0002", 404],
      ["XX000", 500],
    ];
    for (const [code, status] of cases) {
      const { client } = fakeClient({ error: { code } });
      expect((await saveProhibited(client, { kind: "delete", id: ID })).status).toBe(status);
    }
  });
});
