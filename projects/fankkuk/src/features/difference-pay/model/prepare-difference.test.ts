import { describe, expect, it } from "vitest";
import { prepareDifference } from "./prepare-difference";

// 차액 결제 준비 (payment INV-M1·M11·M13, session-login INV-L3). DB 함수의 판정을 응답으로 옮기는 자리만 본다 —
// 누구 상자인지·기한은 DB 가 정한다(통합 시험 difference-payment-db 가 실제 DB 로 본다).

const BOX = "00000000-0000-4000-a000-0000000000c1";

function fakeClient(reply: { data?: unknown; error: { code: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { calls, client };
}

describe("차액 결제 준비", () => {
  it("INV-M11: 상자 ID 만 넘기고, DB 가 정한 결제 번호·금액을 돌려준다", async () => {
    const { calls, client } = fakeClient({ data: [{ toss_order_id: "diff_abc123", amount_krw: 2000, order_no: "FC-T12345" }], error: null });
    expect(await prepareDifference(client, { boxId: BOX })).toEqual({
      status: 200,
      body: { orderId: "diff_abc123", amountKrw: 2000, orderNo: "FC-T12345" },
    });
    expect(calls).toEqual([{ fn: "prepare_difference_payment", args: { p_box_id: BOX } }]);
  });

  it("INV-M1 (실패경로): 브라우저가 금액을 같이 보내면 DB 를 부르지 않고 400", async () => {
    const { calls, client } = fakeClient({ error: null });
    expect((await prepareDifference(client, { boxId: BOX, amountKrw: 1 })).status).toBe(400);
    expect((await prepareDifference(client, { boxId: "x" })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("INV-L3 · INV-M13 (실패경로): 남의 상자 404 · 기한 지남 409 · 이미 냄 409 · 결제 중 409 · 그 밖 500", async () => {
    const status = async (code: string) => (await prepareDifference(fakeClient({ error: { code } }).client, { boxId: BOX })).status;
    expect(await status("P0002")).toBe(404);
    expect(await status("P0022")).toBe(409);
    expect(await status("P0023")).toBe(409);
    expect(await status("P0024")).toBe(409);
    expect(await status("XX000")).toBe(500);
  });

  it("(실패경로): DB 답의 꼴이 다르면 500 — 금액 0 이나 결제 번호 없는 줄을 결제창에 넘기지 않는다", async () => {
    for (const data of [[], [{ toss_order_id: "diff_abc123", amount_krw: 0, order_no: "FC-T1" }], [{ amount_krw: 2000, order_no: "FC-T1" }]]) {
      expect((await prepareDifference(fakeClient({ data, error: null }).client, { boxId: BOX })).status).toBe(500);
    }
  });
});
