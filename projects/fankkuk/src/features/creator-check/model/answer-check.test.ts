import { describe, expect, it } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";
import { answerCreatorCheck } from "./answer-check";

// 크리에이터 확인의 답 (office-workflow INV-W4·W6, 2026-10-12 (2) 문제집 D3 ②). DB 함수가 주인 확인·기한·상태를 지키고,
// 여기서는 세션·본문 꼴·결과 문구만 본다.

const CREATOR: Viewer = { userId: "c-1", role: "creator", nickname: "하루" };
const FAN: Viewer = { userId: "f-1", role: "fan", nickname: "별빛" };
const BODY = { orderNo: "FC-7K3M9", boxSeq: 1, answer: "accept" };

function fakeClient(reply: { data?: unknown; error?: { code: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  } as never;
  return { client, calls };
}

describe("크리에이터 확인 답 저장 (INV-W4)", () => {
  it("INV-W4: 받기·돌려보내기는 주문번호·상자 순번·답 세 칸만 DB 에 넘기고 결과를 돌려준다", async () => {
    for (const [answer, data] of [["accept", "accepted"], ["return", "returned"]] as const) {
      const { client, calls } = fakeClient({ data });
      expect(await answerCreatorCheck({ client, viewer: CREATOR }, { ...BODY, answer })).toEqual({ ok: true, answer: data });
      expect(calls).toEqual([{ fn: "answer_creator_check", args: { p_order_no: "FC-7K3M9", p_box_seq: 1, p_answer: answer } }]);
    }
  });

  it("INV-W4 (실패경로): 로그인 없음 401 · 팬 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [[null, 401], [FAN, 403]] as const) {
      const { client, calls } = fakeClient({ data: "accepted" });
      expect((await answerCreatorCheck({ client, viewer }, BODY)).ok).toBe(false);
      expect(((await answerCreatorCheck({ client, viewer }, BODY)) as { status: number }).status).toBe(status);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W4 (실패경로): 모르는 답·다른 칸·잘못된 주문번호는 DB 를 부르지 않고 400", async () => {
    for (const body of [
      { ...BODY, answer: "maybe" },
      { ...BODY, accountId: "x" },
      { ...BODY, orderNo: "../creator" },
      { ...BODY, boxSeq: 0 },
      null,
    ]) {
      const { client, calls } = fakeClient({ data: "accepted" });
      expect(await answerCreatorCheck({ client, viewer: CREATOR }, body)).toMatchObject({ ok: false, status: 400 });
      expect(calls).toEqual([]);
    }
  });

  it("INV-W4·W6 (실패경로): DB 결과마다 문구 — 없음 404, 이미·기한 지남·끝남 409", async () => {
    const cases = [
      ["not_found", 404, "찾을 수 없는 상자예요."],
      ["already", 409, "이미 답한 상자예요. 새로 고침하면 결과가 보여요."],
      ["expired", 409, "7일이 지나 보낸 분에게 돌려보내는 상자예요."],
      ["closed", 409, "선물이 끝나 더 답할 수 없는 상자예요. 새로 고침해 주세요."],
    ] as const;
    for (const [data, status, message] of cases) {
      const { client } = fakeClient({ data });
      expect(await answerCreatorCheck({ client, viewer: CREATOR }, BODY)).toEqual({ ok: false, status, message });
    }
  });

  it("INV-W4 (실패경로): DB 오류·모르는 결과는 던진다 — 성공으로 치지 않는다", async () => {
    await expect(answerCreatorCheck({ client: fakeClient({ error: { code: "40001" } }).client, viewer: CREATOR }, BODY)).rejects.toThrow();
    await expect(answerCreatorCheck({ client: fakeClient({ data: "ok" }).client, viewer: CREATOR }, BODY)).rejects.toThrow();
  });
});
