import { describe, expect, it } from "vitest";
import { setFollow } from "./set-follow";

const FAN = { userId: "fan-byeolbit", role: "fan" } as const;
const HARU = "00000000-0000-4000-b000-000000000001";

function fakeClient(error: { code: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: null, error };
      },
    } as never,
  };
}

describe("팔로우 저장", () => {
  it("크리에이터 id 와 켜고 끄기만 DB 함수에 넘긴다 — 본문의 사람 칸은 넘기지 않는다", async () => {
    const f = fakeClient();
    const r = await setFollow(
      { client: f.client, viewer: FAN },
      {
        creatorId: HARU,
        following: true,
        fanId: "fan-daltokki",
        p_fan_id: "x",
      },
    );
    expect(r).toEqual({ ok: true, following: true });
    expect(f.calls).toEqual([
      { fn: "set_follow", args: { p_creator_id: HARU, p_following: true } },
    ]);
  });

  it("로그인하지 않았으면 401, DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect(
      await setFollow(
        { client: f.client, viewer: null },
        { creatorId: HARU, following: true },
      ),
    ).toMatchObject({ ok: false, status: 401 });
    expect(f.calls).toEqual([]);
  });

  it("크리에이터 계정은 403, DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    const r = await setFollow(
      { client: f.client, viewer: { userId: "c-haru", role: "creator" } },
      { creatorId: HARU, following: true },
    );
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(f.calls).toEqual([]);
  });

  it("꼴이 틀리면 400 — id 가 uuid 가 아니거나 켜고 끄기가 참·거짓이 아님", async () => {
    const f = fakeClient();
    expect(
      await setFollow(
        { client: f.client, viewer: FAN },
        { creatorId: "haru", following: true },
      ),
    ).toMatchObject({ status: 400 });
    expect(
      await setFollow(
        { client: f.client, viewer: FAN },
        { creatorId: HARU, following: "true" },
      ),
    ).toMatchObject({ status: 400 });
    expect(
      await setFollow({ client: f.client, viewer: FAN }, null),
    ).toMatchObject({ status: 400 });
    expect(f.calls).toEqual([]);
  });

  it("DB 가 없는 크리에이터라고 하면 404, 권한 없음이면 403", async () => {
    expect(
      await setFollow(
        { client: fakeClient({ code: "P0002" }).client, viewer: FAN },
        { creatorId: HARU, following: true },
      ),
    ).toMatchObject({ status: 404 });
    expect(
      await setFollow(
        { client: fakeClient({ code: "42501" }).client, viewer: FAN },
        { creatorId: HARU, following: true },
      ),
    ).toMatchObject({ status: 403 });
  });

  it("그 밖의 DB 오류는 삼키지 않는다", async () => {
    await expect(
      setFollow(
        { client: fakeClient({ code: "XX000" }).client, viewer: FAN },
        { creatorId: HARU, following: true },
      ),
    ).rejects.toThrow();
  });
});
