import { describe, expect, it } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";
import { chooseCreatorCheck } from "./choose-check";

// 블루투스 상자 고르기·취소 (office-workflow INV-W13, action-center INV-J8). DB 함수가 주인·운영자 처리 전·기한·상태를 지키고,
// 여기서는 세션·본문 꼴·부르는 함수·결과 문구만 본다.

const CREATOR: Viewer = { userId: "c-1", role: "creator", nickname: "하루" };
const FAN: Viewer = { userId: "f-1", role: "fan", nickname: "별빛" };
const CHOOSE = { action: "choose", orderNo: "FC-7K3M9", boxSeq: 1, choice: "accept" };
const CANCEL = { action: "cancel", orderNo: "FC-7K3M9", boxSeq: 1 };

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

describe("블루투스 상자 고르기·취소 (INV-W13)", () => {
  it("INV-W13: 고르기는 주문번호·상자 순번·선택만, 취소는 주문번호·상자 순번만 DB 에 넘긴다", async () => {
    for (const choice of ["accept", "return"] as const) {
      const { client, calls } = fakeClient({ data: "chosen" });
      expect(await chooseCreatorCheck({ client, viewer: CREATOR }, { ...CHOOSE, choice })).toEqual({ ok: true, state: "chosen" });
      expect(calls).toEqual([{ fn: "choose_creator_check", args: { p_order_no: "FC-7K3M9", p_box_seq: 1, p_choice: choice } }]);
    }
    const { client, calls } = fakeClient({ data: "cancelled" });
    expect(await chooseCreatorCheck({ client, viewer: CREATOR }, CANCEL)).toEqual({ ok: true, state: "cancelled" });
    expect(calls).toEqual([{ fn: "cancel_creator_check", args: { p_order_no: "FC-7K3M9", p_box_seq: 1 } }]);
  });

  it("INV-W13 (실패경로): 로그인 없음 401 · 팬 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [[null, 401], [FAN, 403]] as const) {
      const { client, calls } = fakeClient({ data: "chosen" });
      const r = await chooseCreatorCheck({ client, viewer }, CHOOSE);
      expect(r).toMatchObject({ ok: false, status });
      expect(calls).toEqual([]);
    }
  });

  it("INV-W13 (실패경로): 본문 꼴이 다르면 400 — 사람·계정 칸, 모르는 선택, 취소에 선택을 붙인 것", async () => {
    for (const body of [{ ...CHOOSE, creatorId: "x" }, { ...CHOOSE, choice: "maybe" }, { ...CANCEL, choice: "accept" }, { ...CHOOSE, action: "process" }, null]) {
      const { client, calls } = fakeClient({ data: "chosen" });
      expect(await chooseCreatorCheck({ client, viewer: CREATOR }, body)).toMatchObject({ ok: false, status: 400 });
      expect(calls).toEqual([]);
    }
  });

  it("INV-W13 (실패경로): 거부 결과는 저장되지 않은 것으로 — 없음 404, 이미 고름·고른 것 없음·처리됨·기한 지남·끝남 409", async () => {
    for (const [data, status] of [["not_found", 404], ["already_chosen", 409], ["not_chosen", 409], ["processed", 409], ["expired", 409], ["closed", 409]] as const) {
      const { client } = fakeClient({ data });
      expect([data, await chooseCreatorCheck({ client, viewer: CREATOR }, CHOOSE)]).toEqual([data, expect.objectContaining({ ok: false, status })]);
    }
  });

  it("INV-W13 (실패경로): 모르는 답·요청과 다른 답·DB 오류는 성공으로 치지 않는다(던진다). 40001 은 다시 하라는 409", async () => {
    await expect(chooseCreatorCheck({ client: fakeClient({ data: "accepted" }).client, viewer: CREATOR }, CHOOSE)).rejects.toThrow();
    await expect(chooseCreatorCheck({ client: fakeClient({ data: "cancelled" }).client, viewer: CREATOR }, CHOOSE)).rejects.toThrow();
    await expect(chooseCreatorCheck({ client: fakeClient({ data: "chosen" }).client, viewer: CREATOR }, CANCEL)).rejects.toThrow();
    await expect(chooseCreatorCheck({ client: fakeClient({ error: { code: "XX000" } }).client, viewer: CREATOR }, CHOOSE)).rejects.toThrow();
    expect(await chooseCreatorCheck({ client: fakeClient({ error: { code: "40001" } }).client, viewer: CREATOR }, CHOOSE)).toMatchObject({ ok: false, status: 409 });
  });
});
