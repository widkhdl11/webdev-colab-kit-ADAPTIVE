import { describe, expect, it } from "vitest";
import { declineGift } from "./decline-gift";

const HARU = { userId: "creator-haru", role: "creator" } as const;

function fakeClient(result: unknown, waiting: { order_no: string }[] = []) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        if (fn === "my_approval_requests") return { data: waiting, error: null };
        return { data: result, error: null };
      },
    } as never,
  };
}

describe("받지 않기 저장 (decline-block)", () => {
  it("INV-D1: 요청 식별값과 차단 여부만 DB 함수에 넘긴다 — 본문의 사람·계정 칸은 넘기지 않는다", async () => {
    const f = fakeClient("declined", [{ order_no: "FC-B" }]);
    const r = await declineGift(
      { client: f.client, viewer: HARU },
      { requestId: "apr_FCA", block: true, senderId: "fan-other", p_sender_id: "x", creatorId: "c2" },
    );
    expect(r).toEqual({ ok: true, waitingOrderNos: ["FC-B"] });
    expect(f.calls).toEqual([
      { fn: "decline_gift", args: { p_request_id: "apr_FCA", p_block: true } },
      { fn: "my_approval_requests", args: undefined },
    ]);
  });

  it("INV-D1: 로그인하지 않았으면 401, 팬·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeClient("declined");
      const r = await declineGift({ client: f.client, viewer }, { requestId: "apr_FCA", block: false });
      expect(r).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("형식이 다르면 400 — 요청 식별값 꼴, 차단 여부 빠짐", async () => {
    for (const body of [{ requestId: "FC-A", block: false }, { requestId: "apr_FCA" }, null, "apr_FCA"]) {
      const f = fakeClient("declined");
      expect(await declineGift({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-D1: 남의 요청·없는 요청은 404 하나로", async () => {
    const f = fakeClient("not_found");
    expect(await declineGift({ client: f.client, viewer: HARU }, { requestId: "apr_FCA", block: true })).toEqual({
      ok: false,
      status: 404,
      message: "찾을 수 없는 요청이에요.",
    });
  });

  it("INV-D4·D2: 이미 처리된 요청과 거절할 수 없는 주문은 409 로 각자의 문구", async () => {
    const already = await declineGift({ client: fakeClient("already").client, viewer: HARU }, { requestId: "apr_FCA", block: false });
    const notDeclinable = await declineGift({ client: fakeClient("not_declinable").client, viewer: HARU }, { requestId: "apr_FCA", block: false });
    expect(already).toMatchObject({ ok: false, status: 409, message: expect.stringContaining("이미 처리된") });
    expect(notDeclinable).toMatchObject({ ok: false, status: 409, message: expect.stringContaining("받지 않기로 할 수 없는") });
  });

  it("모르는 결과 값이면 성공으로 치지 않는다", async () => {
    await expect(declineGift({ client: fakeClient("approved").client, viewer: HARU }, { requestId: "apr_FCA", block: false })).rejects.toThrow();
  });
});
