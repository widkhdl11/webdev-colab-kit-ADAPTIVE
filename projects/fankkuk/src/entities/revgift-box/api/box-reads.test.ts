// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readBoxForFan, readCreatorOpenBoxes, readMyBox, readMyBoxes } from "./box-reads";

function fakeClient(data: unknown, error: { code: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data, error };
      },
    } as never,
  };
}

const BOX = "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10";
const APP = "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";

describe("선물함 읽기 (revgift-box INV-GB7·GB9)", () => {
  it("INV-GB9 S9: 신청 관리 창 — 신청 줄은 번호·닉네임·신청 시각·상태만 받는다", async () => {
    const f = fakeClient({
      id: BOX,
      name: "겨울 선물",
      capacity: 30,
      is_public: false,
      status: "open",
      invite_token: "a".repeat(32),
      created_at: "2026-11-08T01:00:00+00:00",
      applications: [{ id: APP, nickname: "별빛", applied_at: "2026-11-08T02:00:00+00:00", status: "excluded" }],
    });
    expect(await readMyBox(f.client, BOX)).toEqual({
      id: BOX,
      name: "겨울 선물",
      capacity: 30,
      isPublic: false,
      status: "open",
      inviteToken: "a".repeat(32),
      createdAt: "2026-11-08T01:00:00+00:00",
      applications: [{ id: APP, nickname: "별빛", appliedAt: "2026-11-08T02:00:00+00:00", status: "excluded" }],
    });
    expect(f.calls).toEqual([{ fn: "my_revgift_box", args: { p_box_id: BOX } }]);
  });

  it("INV-GB9 S9b: 신청 줄에 다른 칸(로그인 아이디·주소 등)이 섞이면 받지 않는다", async () => {
    const row = { id: BOX, name: "a", capacity: 1, is_public: true, status: "open", invite_token: null, created_at: "2026-11-08T01:00:00+00:00" };
    for (const extra of [{ login_id: "byeolbit_fan" }, { address: "서울" }, { fan_id: APP }]) {
      const f = fakeClient({ ...row, applications: [{ id: APP, nickname: "별빛", applied_at: "2026-11-08T02:00:00+00:00", status: "applied", ...extra }] });
      await expect(readMyBox(f.client, BOX)).rejects.toThrow();
    }
    // 같은 꼴이면 받는다(위 거부가 꼴 때문인지 확인)
    const ok = fakeClient({ ...row, applications: [{ id: APP, nickname: "별빛", applied_at: "2026-11-08T02:00:00+00:00", status: "applied" }] });
    expect((await readMyBox(ok.client, BOX))?.applications).toHaveLength(1);
  });

  it("INV-GB7: 주인이 아니거나 없는 선물함은 null, 선물함 번호 꼴이 아니면 부르지도 않는다", async () => {
    expect(await readMyBox(fakeClient(null).client, BOX)).toBeNull();
    const f = fakeClient(null);
    expect(await readMyBox(f.client, "not-a-uuid")).toBeNull();
    expect(f.calls).toEqual([]);
  });

  it("내 선물함 목록은 이름·상태·인원·신청 수만", async () => {
    const f = fakeClient([{ id: BOX, name: "겨울 선물", capacity: 30, is_public: true, status: "closed", created_at: "2026-11-08T01:00:00+00:00", active_count: 3 }]);
    expect(await readMyBoxes(f.client)).toEqual([
      { id: BOX, name: "겨울 선물", capacity: 30, isPublic: true, status: "closed", createdAt: "2026-11-08T01:00:00+00:00", activeCount: 3 },
    ]);
  });

  it("INV-GB4 · GB9 S9c: 팬이 보는 선물함 — 다른 신청자 수 칸이 섞이면 받지 않는다, 비공개 토큰이 틀리면 null", async () => {
    const seen = {
      id: BOX,
      name: "겨울 선물",
      creator: { id: BOX, slug: "haru", name: "하루" },
      open: true,
      viewer: "follower",
      my_state: "none",
    };
    const f = fakeClient(seen);
    expect(await readBoxForFan(f.client, BOX, "t".repeat(32))).toEqual({
      id: BOX,
      name: "겨울 선물",
      creator: { id: BOX, slug: "haru", name: "하루" },
      open: true,
      viewer: "follower",
      myState: "none",
    });
    expect(f.calls).toEqual([{ fn: "revgift_box_for_fan", args: { p_box_id: BOX, p_token: "t".repeat(32) } }]);
    await expect(readBoxForFan(fakeClient({ ...seen, applicant_count: 3 }).client, BOX, null)).rejects.toThrow();
    expect(await readBoxForFan(fakeClient(null).client, BOX, "x")).toBeNull();
  });

  it("크리에이터 상세 입구 — 공개 선물함 이름만", async () => {
    const f = fakeClient([{ id: BOX, name: "겨울 선물" }]);
    expect(await readCreatorOpenBoxes(f.client, BOX)).toEqual([{ id: BOX, name: "겨울 선물" }]);
  });
});
