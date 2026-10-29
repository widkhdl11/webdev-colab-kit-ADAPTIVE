import { describe, expect, it } from "vitest";
import { ackEarlySend } from "./early-send";

// 「먼저 보내기」 (approval-signature INV-S9). 주문번호만 넘기고, 누구 주문인지·누를 수 있는 상태인지는 DB 가 로그인 토큰으로 판정한다.

const FAN = { userId: "fan-byeolbit", role: "fan" } as const;
const CREATOR = { userId: "c-haru", role: "creator" } as const;
const OPERATOR = { userId: "op", role: "operator" } as const;

function fakeClient(error: { code: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: null, error };
    },
  } as never;
  return { client, calls };
}

describe("INV-S9: 「먼저 보내기」 기록", () => {
  it("INV-S9 (S9): 보낸 사람(팬·크리에이터)이 주문번호 하나만 DB 함수에 넘긴다", async () => {
    const f = fakeClient();
    expect(await ackEarlySend({ client: f.client, viewer: FAN }, { orderNo: "FC-7K3M9" })).toEqual({ status: 200, body: { acknowledged: true } });
    expect(f.calls).toEqual([{ fn: "ack_early_send", args: { p_order_no: "FC-7K3M9" } }]);
    expect((await ackEarlySend({ client: fakeClient().client, viewer: CREATOR }, { orderNo: "FC-7K3M9" })).status).toBe(200);
  });

  it("INV-S9 (S9d, 실패경로): 남의 주문·누를 수 없는 상태(P0002)는 404", async () => {
    expect((await ackEarlySend({ client: fakeClient({ code: "P0002" }).client, viewer: FAN }, { orderNo: "FC-7K3M9" })).status).toBe(404);
  });

  it("INV-S9 (실패경로): 로그인 안 함 401 · 운영자 403 · 다른 칸·꼴이 다른 주문번호 400 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await ackEarlySend({ client: f.client, viewer: null }, { orderNo: "FC-7K3M9" })).status).toBe(401);
    expect((await ackEarlySend({ client: f.client, viewer: OPERATOR }, { orderNo: "FC-7K3M9" })).status).toBe(403);
    expect((await ackEarlySend({ client: f.client, viewer: FAN }, { orderNo: "FC-7K3M9", fanId: "x" })).status).toBe(400);
    expect((await ackEarlySend({ client: f.client, viewer: FAN }, { orderNo: "fc 7k3m9" })).status).toBe(400);
    expect(f.calls).toEqual([]);
  });
});
