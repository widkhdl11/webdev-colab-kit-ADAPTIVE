import { describe, expect, it } from "vitest";
import { saveCreatorTags } from "./save-creator-tags";

const HARU = { userId: "creator-haru", role: "creator" } as const;
const FAN = { userId: "fan-byeol", role: "fan" } as const;
const CHZZK = "11111111-1111-4111-8111-000000000002";
const VIRTUAL = "11111111-1111-4111-8111-000000000009";
const MOMO_CREATOR = "00000000-0000-4000-b000-000000000002";

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

describe("크리에이터 태그 저장 (creator-tags INV-T2·T3)", () => {
  it("INV-T2 S2: 선택지 id 와 직접 입력만 DB 함수에 넘긴다 — 본문의 크리에이터 ID·계정 ID 는 넘기지 않는다", async () => {
    const f = fakeClient();
    const r = await saveCreatorTags(
      { client: f.client, viewer: HARU },
      { tagIds: [CHZZK, VIRTUAL], customTag: " 팝콘TV ", creatorId: MOMO_CREATOR, accountId: "momo" },
    );
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_tags", args: { p_option_ids: [CHZZK, VIRTUAL], p_custom_tag: "팝콘TV" } }]);
  });

  it("INV-T3: 직접 입력이 없으면 null 로 넘긴다", async () => {
    const f = fakeClient();
    expect(await saveCreatorTags({ client: f.client, viewer: HARU }, { tagIds: [CHZZK], customTag: "   " })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_tags", args: { p_option_ids: [CHZZK], p_custom_tag: null } }]);
  });

  it("INV-T2 S2b (실패경로): 로그인 안 함 401 · 팬 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [FAN, 403],
    ] as const) {
      const f = fakeClient();
      expect(await saveCreatorTags({ client: f.client, viewer }, { tagIds: [CHZZK], customTag: "" })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-T3 S3b (실패경로): 0개 · 6개 · 같은 선택지 두 번 · 직접 입력 21자 · 꼴이 틀린 본문은 400, DB 를 부르지 않는다", async () => {
    const five = ["1", "2", "3", "4", "5"].map((n) => `11111111-1111-4111-8111-00000000000${n}`);
    for (const body of [
      { tagIds: [], customTag: "" },
      { tagIds: five, customTag: "팝콘TV" },
      { tagIds: [CHZZK, CHZZK], customTag: "" },
      { tagIds: [CHZZK], customTag: "가".repeat(21) },
      { tagIds: "치지직", customTag: "" },
      null,
    ]) {
      const f = fakeClient();
      const r = await saveCreatorTags({ client: f.client, viewer: HARU }, body);
      expect([body, r.ok ? null : r.status]).toEqual([body, 400]);
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-T3 (실패경로): DB 가 거부하면(숨긴 선택지 등 22023) 400 문구, 로그인 끊김(42501)은 401", async () => {
    expect(await saveCreatorTags({ client: fakeClient({ code: "22023" }).client, viewer: HARU }, { tagIds: [CHZZK], customTag: "" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await saveCreatorTags({ client: fakeClient({ code: "42501" }).client, viewer: HARU }, { tagIds: [CHZZK], customTag: "" })).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});
