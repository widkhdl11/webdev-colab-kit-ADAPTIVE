import { describe, expect, it } from "vitest";
import { prepareResume } from "./resume-payment";

// 결제 이어 하기 (payment INV-M22, INV-M1). DB 함수의 판정을 응답으로 옮기는 자리만 본다 —
// 누구 주문인지·24시간·금액은 DB 가 정한다(통합 시험 resume-payment-db 가 실제 DB 로 본다).

const ORDER_NO = "FC-T12345";

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

describe("결제 이어 하기 준비 (payment INV-M22)", () => {
  it("INV-M22 ①·②: 주문번호만 넘기고, DB 가 만든 새 결제 번호와 처음 저장한 금액을 돌려준다", async () => {
    const { calls, client } = fakeClient({ data: [{ toss_order_id: "pay_abc123def", amount_krw: 6900, order_no: ORDER_NO }], error: null });
    expect(await prepareResume(client, { orderNo: ORDER_NO })).toEqual({
      status: 200,
      body: { orderId: "pay_abc123def", amountKrw: 6900, orderNo: ORDER_NO },
    });
    expect(calls).toEqual([{ fn: "resume_gift_payment", args: { p_order_no: ORDER_NO } }]);
  });

  it("INV-M22 ① · INV-M1 (실패경로): 브라우저가 금액을 같이 보내거나 주문번호 꼴이 틀리면 DB 를 부르지 않고 400", async () => {
    const { calls, client } = fakeClient({ error: null });
    expect((await prepareResume(client, { orderNo: ORDER_NO, amountKrw: 100 })).status).toBe(400);
    expect((await prepareResume(client, { orderNo: "RG-4F8K2A" })).status).toBe(400);
    expect((await prepareResume(client, null)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("INV-M22 ⑤ (실패경로): 남의 주문·없는 주문·닫힌 주문은 같은 404 와 같은 문구 · 결제 중 409 · 그 밖 500", async () => {
    const reply = async (code: string) => prepareResume(fakeClient({ error: { code } }).client, { orderNo: ORDER_NO });
    const notFound = await reply("P0002");
    expect(notFound.status).toBe(404);
    expect(await reply("42501")).toEqual(notFound);
    expect((await reply("P0024")).status).toBe(409);
    expect((await reply("XX000")).status).toBe(500);
  });

  it("(실패경로): DB 답의 꼴이 다르면 500 — 금액 0 이나 결제 번호 없는 줄을 결제창에 넘기지 않는다", async () => {
    for (const data of [[], [{ toss_order_id: "pay_abc123", amount_krw: 0, order_no: ORDER_NO }], [{ amount_krw: 6900, order_no: ORDER_NO }]]) {
      expect((await prepareResume(fakeClient({ data, error: null }).client, { orderNo: ORDER_NO })).status).toBe(500);
    }
  });
});
