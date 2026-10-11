import { describe, expect, it } from "vitest";
import { saveCreatorHardItems } from "./save-creator-settings";

// 받기 어려운 품목 저장 — 앱 서버 경계 (hard-items INV-H3·H4). DB 판정은 통합 시험(hard-items-db)이 본다.

const HARU = { userId: "creator-haru", role: "creator" } as const;
const ok = { categories: ["flower", "doll"], reason: "many", period: "week1", action: "block" };

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

describe("INV-H3: 정해진 네 칸만 넘기고 크리에이터 ID 는 넘기지 않는다", () => {
  it("INV-H3 S3: 본문의 크리에이터 ID·문장 칸은 버리고 넷만", async () => {
    const f = fakeClient();
    const r = await saveCreatorHardItems({ client: f.client, viewer: HARU }, { ...ok, creatorId: "momo", sentence: "택배 그만" });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([
      { fn: "update_my_creator_hard_items", args: { p_categories: ["flower", "doll"], p_reason: "many", p_period: "week1", p_action: "block" } },
    ]);
  });

  it("INV-H3 S3b (실패경로): 팬·로그인 안 함은 DB 를 부르지 않고 403·401", async () => {
    const f = fakeClient();
    expect(await saveCreatorHardItems({ client: f.client, viewer: { userId: "fan", role: "fan" } }, ok)).toMatchObject({ ok: false, status: 403 });
    expect(await saveCreatorHardItems({ client: f.client, viewer: null }, ok)).toMatchObject({ ok: false, status: 401 });
    expect(f.calls).toEqual([]);
  });
});

describe("INV-H4: 고르는 값으로만", () => {
  it("INV-H4 S4 (실패경로): 목록 밖 품목·같은 품목 두 번·목록 밖 이유(문장)·기간·동작은 400, DB 를 부르지 않는다", async () => {
    const bad = [
      { ...ok, categories: ["food"] },
      { ...ok, categories: ["flower", "flower"] },
      { ...ok, reason: "택배가 너무 많아요" },
      { ...ok, period: "week3" },
      { ...ok, action: "hide" },
      { ...ok, reason: undefined },
    ];
    for (const body of bad) {
      const f = fakeClient();
      expect(await saveCreatorHardItems({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-H4 S4b: 품목 없이 저장하면(해제) 빈 목록을 넘긴다", async () => {
    const f = fakeClient();
    expect(await saveCreatorHardItems({ client: f.client, viewer: HARU }, { ...ok, categories: [] })).toEqual({ ok: true });
    expect((f.calls[0]?.args as { p_categories: unknown }).p_categories).toEqual([]);
  });

  it("INV-H4: DB 가 22023 으로 거부하면 400 과 안내 문구", async () => {
    const f = fakeClient({ code: "22023" });
    expect(await saveCreatorHardItems({ client: f.client, viewer: HARU }, ok)).toEqual({ ok: false, status: 400, message: "품목·이유·기간·동작을 목록에서 골라 주세요." });
  });
});
