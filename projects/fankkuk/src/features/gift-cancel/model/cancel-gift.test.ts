import { describe, expect, it } from "vitest";
import { cancelMyGift } from "./cancel-gift";

// 팬의 입고 전 취소 (payment INV-M16). 주문번호만 넘기고, 누구 주문인지·취소할 수 있는 상태인지는 DB 가 로그인 토큰으로 판정한다.

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

describe("INV-M16: 팬의 입고 전 취소", () => {
  it("INV-M16 (S16): 보낸 사람(팬·크리에이터)이 주문번호 하나만 DB 함수에 넘기고 200", async () => {
    const f = fakeClient();
    expect(await cancelMyGift({ client: f.client, viewer: FAN }, { orderNo: "FC-7K3M9" })).toEqual({ status: 200, body: { canceled: true } });
    expect(f.calls).toEqual([{ fn: "cancel_my_gift", args: { p_order_no: "FC-7K3M9" } }]);
    expect((await cancelMyGift({ client: fakeClient().client, viewer: CREATOR }, { orderNo: "FC-7K3M9-2" })).status).toBe(200);
  });

  it("INV-M16 (S16b, 실패경로): 남의 주문·입고된 상자가 있는 주문(P0002)은 409 와 새로고침 안내", async () => {
    expect(await cancelMyGift({ client: fakeClient({ code: "P0002" }).client, viewer: FAN }, { orderNo: "FC-7K3M9" })).toEqual({
      status: 409,
      body: { message: "현재 취소할 수 없는 선물입니다. 새로고침해 주세요." },
    });
  });

  it("INV-M16 (실패경로): DB 의 로그인 거부(42501)는 403, 그 밖의 오류는 500", async () => {
    expect((await cancelMyGift({ client: fakeClient({ code: "42501" }).client, viewer: FAN }, { orderNo: "FC-7K3M9" })).status).toBe(403);
    expect((await cancelMyGift({ client: fakeClient({ code: "XX000" }).client, viewer: FAN }, { orderNo: "FC-7K3M9" })).status).toBe(500);
  });

  it("INV-M16 (S16b, 실패경로): 로그인 안 함 401 · 운영자 403 · 다른 칸·꼴이 다른 주문번호 400 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await cancelMyGift({ client: f.client, viewer: null }, { orderNo: "FC-7K3M9" })).status).toBe(401);
    expect((await cancelMyGift({ client: f.client, viewer: OPERATOR }, { orderNo: "FC-7K3M9" })).status).toBe(403);
    expect((await cancelMyGift({ client: f.client, viewer: FAN }, { orderNo: "FC-7K3M9", fanId: "x" })).status).toBe(400);
    expect((await cancelMyGift({ client: f.client, viewer: FAN }, { orderNo: "fc 7k3m9" })).status).toBe(400);
    expect((await cancelMyGift({ client: f.client, viewer: FAN }, null)).status).toBe(400);
    expect(f.calls).toEqual([]);
  });
});
