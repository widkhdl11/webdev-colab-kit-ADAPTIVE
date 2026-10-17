import { describe, expect, it } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";
import { confirmReturnAddress } from "./confirm-return-address";

// 반송 주소 확인 (office-workflow INV-W15, action-center INV-J4). DB 함수가 보낸 사람·상태·기한·등록 주소 복사를 지키고,
// 여기서는 세션·본문 꼴·부르는 함수·결과 갈래만 본다.

const FAN: Viewer = { userId: "f-1", role: "fan", nickname: "별빛" };
const CREATOR: Viewer = { userId: "c-1", role: "creator", nickname: "하루" };
const OPERATOR: Viewer = { userId: "o-1", role: "operator" };

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

describe("반송 주소 확인 (INV-W15)", () => {
  it("INV-W15 (S15): 팬 선물 상자는 주문번호·상자 순번, 역조공 몫은 주문번호만 DB 에 넘긴다 — 주소·계정 칸은 없다", async () => {
    const gift = fakeClient({ data: "confirmed" });
    expect(await confirmReturnAddress({ client: gift.client, viewer: FAN }, { orderNo: "FC-7K3M9", boxSeq: 2 })).toEqual({ ok: true });
    expect(gift.calls).toEqual([{ fn: "confirm_return_address", args: { p_order_no: "FC-7K3M9", p_box_seq: 2 } }]);
    const share = fakeClient({ data: "confirmed" });
    expect(await confirmReturnAddress({ client: share.client, viewer: CREATOR }, { orderNo: "RG-AAA111" })).toEqual({ ok: true });
    expect(share.calls).toEqual([{ fn: "confirm_return_address", args: { p_order_no: "RG-AAA111", p_box_seq: null } }]);
  });

  it("INV-W15 (실패경로): 로그인 없음 401 · 운영자 403 · 꼴이 틀린 본문(주소·계정 칸 포함) 400 — DB 를 부르지 않는다", async () => {
    const cases: [Viewer | null, unknown, number][] = [
      [null, { orderNo: "FC-7K3M9", boxSeq: 1 }, 401],
      [OPERATOR, { orderNo: "FC-7K3M9", boxSeq: 1 }, 403],
      [FAN, { orderNo: "fc 7k", boxSeq: 1 }, 400],
      [FAN, { orderNo: "FC-7K3M9", boxSeq: 0 }, 400],
      [FAN, { orderNo: "FC-7K3M9", boxSeq: 1, envelope: { v: 1 } }, 400],
      [FAN, { orderNo: "FC-7K3M9", boxSeq: 1, accountId: "f-2" }, 400],
    ];
    for (const [viewer, body, status] of cases) {
      const { client, calls } = fakeClient({ data: "confirmed" });
      expect(await confirmReturnAddress({ client, viewer }, body)).toMatchObject({ ok: false, status });
      expect(calls).toEqual([]);
    }
  });

  it("INV-W15 (S15b·S15c, 실패경로): 남의·없는 상자 404, 등록 주소 없음·기한 지남·이미 출력 409 — 갈래마다 다른 사유", async () => {
    const cases = [
      ["not_found", 404],
      ["no_address", 409],
      ["expired", 409],
      ["closed", 409],
    ] as const;
    for (const [reply, status] of cases) {
      const { client } = fakeClient({ data: reply });
      expect([reply, await confirmReturnAddress({ client, viewer: FAN }, { orderNo: "FC-7K3M9", boxSeq: 1 })]).toEqual([reply, { ok: false, status, reason: reply }]);
    }
  });

  it("INV-W15 (실패경로): 모르는 답·DB 오류는 성공으로 치지 않는다, 잠금 충돌(40001)은 다시 하라는 409", async () => {
    await expect(confirmReturnAddress({ client: fakeClient({ data: "maybe" }).client, viewer: FAN }, { orderNo: "FC-7K3M9", boxSeq: 1 })).rejects.toThrow();
    await expect(confirmReturnAddress({ client: fakeClient({ error: { code: "XX000" } }).client, viewer: FAN }, { orderNo: "FC-7K3M9", boxSeq: 1 })).rejects.toThrow();
    expect(await confirmReturnAddress({ client: fakeClient({ error: { code: "40001" } }).client, viewer: FAN }, { orderNo: "FC-7K3M9", boxSeq: 1 })).toEqual({
      ok: false,
      status: 409,
      reason: "retry",
    });
  });
});
