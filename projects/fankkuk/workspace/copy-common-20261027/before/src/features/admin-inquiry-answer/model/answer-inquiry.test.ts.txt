import { describe, expect, it } from "vitest";
import { answerInquiry } from "./answer-inquiry";

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

describe("1:1 문의 답하기 (INV-K11)", () => {
  it("INV-K11: 직원 운영자도 답한다 — 앞뒤 공백을 떼고 DB 답 함수에 넘기고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await answerInquiry(client, { id: ID, answer: "  확인했어요. " })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_answer_inquiry", args: { p_id: ID, p_answer: "확인했어요." } }]);
  });

  it("INV-K11 (실패경로): 운영자가 아니면(문의를 쓴 사람 포함) 404 — DB 답 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient(null, { operator: false, owner: false });
    expect(await answerInquiry(client, { id: ID, answer: "답" })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-K11 (실패경로): 빈 답·4000자 넘는 답·꼴이 틀린 몸통은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [null, { id: ID, answer: "" }, { id: ID, answer: "   " }, { id: ID, answer: "가".repeat(4001) }, { id: "x", answer: "답" }, { id: "", answer: "답" }, { id: ID }, { id: ID, answer: "답", status: "answered" }];
    for (const body of bad) {
      const { calls, client } = fakeClient(null);
      expect((await answerInquiry(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-K11: 답 4000자는 받는다", async () => {
    const { calls, client } = fakeClient(null);
    expect((await answerInquiry(client, { id: ID, answer: "가".repeat(4000) })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("INV-K11 (실패경로): 이미 답한 문의(55000)는 409 「이미 답한 문의예요. 새로 고침해 주세요.」, 42501→403, P0002→404, 22023→400", async () => {
    const twice = fakeClient({ code: "55000" });
    expect(await answerInquiry(twice.client, { id: ID, answer: "답" })).toEqual({ status: 409, body: { message: "이미 답한 문의예요. 새로 고침해 주세요." } });
    for (const [code, status] of [
      ["42501", 403],
      ["P0002", 404],
      ["22023", 400],
      ["XX000", 500],
    ] as const) {
      const { client } = fakeClient({ code });
      expect((await answerInquiry(client, { id: ID, answer: "답" })).status).toBe(status);
    }
  });
});
