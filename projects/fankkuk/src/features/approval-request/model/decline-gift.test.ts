import { describe, expect, it } from "vitest";
import { declineGift } from "./decline-gift";

const HARU = { userId: "creator-haru", role: "creator" } as const;

function fakeClient(data: unknown) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data, error: null };
      },
    } as never,
  };
}

const reply = (result: string, also: string[] = []) => ({ result, also_declined: also });

describe("받지 않기 저장 (decline-block)", () => {
  it("INV-D1: 요청 식별값과 차단 여부만 DB 함수에 넘긴다 — 본문의 사람·계정 칸은 넘기지 않는다", async () => {
    const f = fakeClient(reply("declined", ["FC-B"]));
    const r = await declineGift(
      { client: f.client, viewer: HARU },
      { requestId: "apr_FCA", block: true, senderId: "fan-other", p_sender_id: "x", creatorId: "c2" },
    );
    expect(r).toEqual({ ok: true, alsoDeclinedOrderNos: ["FC-B"] });
    expect(f.calls).toEqual([{ fn: "decline_gift", args: { p_request_id: "apr_FCA", p_block: true } }]);
  });

  it("INV-D1: 로그인하지 않았으면 401, 팬·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeClient(reply("declined"));
      const r = await declineGift({ client: f.client, viewer }, { requestId: "apr_FCA", block: false });
      expect(r).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("형식이 다르면 400 — 요청 식별값 꼴, 차단 여부 빠짐", async () => {
    for (const body of [{ requestId: "FC-A", block: false }, { requestId: "apr_FCA" }, null, "apr_FCA"]) {
      const f = fakeClient(reply("declined"));
      expect(await declineGift({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-D1: 남의 요청·없는 요청은 404 하나로", async () => {
    expect(await declineGift({ client: fakeClient(reply("not_found")).client, viewer: HARU }, { requestId: "apr_FCA", block: true })).toEqual({
      ok: false,
      status: 404,
      message: "승인 요청을 찾을 수 없습니다.",
    });
  });

  it("INV-D4·D2: 이미 처리된 요청과 거절할 수 없는 주문은 409 로 각자의 문구", async () => {
    const already = await declineGift({ client: fakeClient(reply("already")).client, viewer: HARU }, { requestId: "apr_FCA", block: false });
    const notDeclinable = await declineGift({ client: fakeClient(reply("not_declinable")).client, viewer: HARU }, { requestId: "apr_FCA", block: false });
    expect(already).toMatchObject({ ok: false, status: 409, message: expect.stringContaining("이미 처리된") });
    expect(notDeclinable).toMatchObject({ ok: false, status: 409, message: expect.stringContaining("거절할 수 없는") });
  });

  it("INV-D2 S2d (실패경로): 168시간이 지난 요청은 409 「기간이 지나 자동으로 반려된 선물이에요」", async () => {
    const r = await declineGift({ client: fakeClient(reply("expired")).client, viewer: HARU }, { requestId: "apr_FCA", block: true });
    expect(r).toEqual({ ok: false, status: 409, message: "승인 기한이 지나 자동 반려된 선물입니다." });
  });

  it("모르는 결과 값·꼴이 다른 응답이면 성공으로 치지 않는다", async () => {
    for (const data of [reply("approved"), "declined", { result: "declined" }, null]) {
      await expect(declineGift({ client: fakeClient(data).client, viewer: HARU }, { requestId: "apr_FCA", block: false })).rejects.toThrow();
    }
  });
});
