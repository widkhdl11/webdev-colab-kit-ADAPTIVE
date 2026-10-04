import { describe, expect, it } from "vitest";
import { unblockSender } from "./unblock-sender";

const HARU = { userId: "creator-haru", role: "creator" } as const;
const BLOCK = "6f1c2a52-0d55-4f0e-9a51-3f7a1f0d2b11";

function fakeClient(result: unknown) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: result, error: null };
      },
    } as never,
  };
}

describe("차단 풀기 저장 (decline-block INV-D10)", () => {
  it("INV-D10: 차단 줄 식별값만 DB 함수에 넘긴다 — 본문의 크리에이터·사람 칸은 넘기지 않는다", async () => {
    const f = fakeClient("unblocked");
    const r = await unblockSender({ client: f.client, viewer: HARU }, { blockId: BLOCK, creatorId: "c2", senderId: "fan-x" });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "unblock_sender", args: { p_block_id: BLOCK } }]);
  });

  it("INV-D10 S10: 로그인하지 않았으면 401, 팬·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeClient("unblocked");
      expect(await unblockSender({ client: f.client, viewer }, { blockId: BLOCK })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("형식이 다르면 400", async () => {
    for (const body of [{ blockId: "x" }, {}, null]) {
      const f = fakeClient("unblocked");
      expect(await unblockSender({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-D10 S10: 남의 차단·없는 차단·이미 푼 차단은 404 하나로", async () => {
    expect(await unblockSender({ client: fakeClient("not_found").client, viewer: HARU }, { blockId: BLOCK })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("모르는 결과 값이면 성공으로 치지 않는다", async () => {
    await expect(unblockSender({ client: fakeClient(true).client, viewer: HARU }, { blockId: BLOCK })).rejects.toThrow();
  });
});
