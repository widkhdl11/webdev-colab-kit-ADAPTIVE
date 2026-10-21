import { describe, expect, it } from "vitest";
import { markGiftNotSent, MESSAGE_NOT_SENT_UNAVAILABLE } from "./mark-not-sent";

// 「아직 보내지 않음」 (office-workflow INV-W10 S10f). 주문번호만 넘기고, 누구 주문인지·남길 수 있는 상태인지는 DB 가 로그인 토큰으로 판정한다.
// 기한은 바꾸지 않는다 — 누른 시각만 남는다.

const FAN = { userId: "fan-byeolbit", role: "fan" } as const;
const CREATOR = { userId: "c-haru", role: "creator" } as const;
const OPERATOR = { userId: "op", role: "operator" } as const;

function fakeClient(reply: { data?: unknown; error: { code: string } | null } = { data: "2026-10-21T03:00:00+00:00", error: null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { client, calls };
}

describe("INV-W10: 「아직 보내지 않음」 기록", () => {
  it("INV-W10 (S10f): 보낸 사람(팬·크리에이터)이 주문번호 하나만 DB 함수에 넘기고, 남은 시각을 돌려받는다", async () => {
    const f = fakeClient();
    expect(await markGiftNotSent({ client: f.client, viewer: FAN }, { orderNo: "FC-7K3M9" })).toEqual({ status: 200, body: { notSentAt: "2026-10-21T03:00:00+00:00" } });
    expect(f.calls).toEqual([{ fn: "mark_gift_not_sent", args: { p_order_no: "FC-7K3M9" } }]);
    expect((await markGiftNotSent({ client: fakeClient().client, viewer: CREATOR }, { orderNo: "FC-7K3M9" })).status).toBe(200);
  });

  it("INV-W10 (S10f, 실패경로): 남의 주문·남길 수 없는 상태(P0002)는 404 · 모르는 답은 500", async () => {
    expect(await markGiftNotSent({ client: fakeClient({ error: { code: "P0002" } }).client, viewer: FAN }, { orderNo: "FC-7K3M9" })).toEqual({
      status: 404,
      body: { message: MESSAGE_NOT_SENT_UNAVAILABLE },
    });
    expect((await markGiftNotSent({ client: fakeClient({ data: 12, error: null }).client, viewer: FAN }, { orderNo: "FC-7K3M9" })).status).toBe(500);
  });

  it("INV-W10 (실패경로): 로그인 안 함 401 · 운영자 403 · 다른 칸·꼴이 다른 주문번호 400 — DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect((await markGiftNotSent({ client: f.client, viewer: null }, { orderNo: "FC-7K3M9" })).status).toBe(401);
    expect((await markGiftNotSent({ client: f.client, viewer: OPERATOR }, { orderNo: "FC-7K3M9" })).status).toBe(403);
    expect((await markGiftNotSent({ client: f.client, viewer: FAN }, { orderNo: "FC-7K3M9", deadline: "x" })).status).toBe(400);
    expect((await markGiftNotSent({ client: f.client, viewer: FAN }, { orderNo: "fc 7k3m9" })).status).toBe(400);
    expect(f.calls).toEqual([]);
  });
});
