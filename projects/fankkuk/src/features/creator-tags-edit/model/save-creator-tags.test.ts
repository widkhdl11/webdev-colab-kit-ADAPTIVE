import { describe, expect, it } from "vitest";
import { saveCreatorTags } from "./save-creator-tags";

const HARU = { userId: "creator-haru", role: "creator" } as const;
const FAN = { userId: "fan-byeol", role: "fan" } as const;
const CHZZK = "11111111-1111-4111-8111-000000000002";
const VIRTUAL = "11111111-1111-4111-8111-000000000009";
const MOMO_CREATOR = "00000000-0000-4000-b000-000000000002";

function fakeClient(error: { code: string; message?: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: null, error: error ? { message: "", ...error } : null };
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

  it("INV-T3 S3b (실패경로): 0개 · 선택지 6개 · 같은 선택지 두 번 · 직접 입력 21자 · 꼴이 틀린 본문은 400, DB 를 부르지 않는다", async () => {
    const six = ["1", "2", "3", "4", "5", "6"].map((n) => `11111111-1111-4111-8111-00000000000${n}`);
    for (const body of [
      { tagIds: [], customTag: "" },
      { tagIds: six, customTag: "" },
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

  it("INV-T3 S3c: 선택지 5개 + 직접 입력은 DB 에 넘긴다 — 직접 입력이 고른 선택지와 같으면 하나로 세는 판정은 이름을 아는 DB 가 한다", async () => {
    const five = ["1", "2", "3", "4", "5"].map((n) => `11111111-1111-4111-8111-00000000000${n}`);
    const f = fakeClient();
    expect(await saveCreatorTags({ client: f.client, viewer: HARU }, { tagIds: five, customTag: "유튜브" })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_tags", args: { p_option_ids: five, p_custom_tag: "유튜브" } }]);
  });

  it("INV-T7 (실패경로): 직접 입력이 필터에 걸리면 400 과 사유 문구(금칙어·연락처·기호만)", async () => {
    expect(await saveCreatorTags({ client: fakeClient({ code: "P0081" }).client, viewer: HARU }, { tagIds: [CHZZK], customTag: "x" })).toEqual({
      ok: false,
      status: 400,
      message: "사용할 수 없는 표현이 포함되어 있습니다. 다른 내용을 입력해 주세요.",
    });
    expect(await saveCreatorTags({ client: fakeClient({ code: "P0083" }).client, viewer: HARU }, { tagIds: [CHZZK], customTag: "x" })).toMatchObject({
      status: 400,
      message: "글자나 숫자를 하나 이상 포함해 주세요.",
    });
  });

  it("INV-T2·T3 (실패경로): DB 가 거부하면(숨긴 선택지 등 22023) 400, 로그인 끊김(42501)은 401, 크리에이터 아님(42501)은 403", async () => {
    expect(await saveCreatorTags({ client: fakeClient({ code: "22023" }).client, viewer: HARU }, { tagIds: [CHZZK], customTag: "" })).toMatchObject({
      ok: false,
      status: 400,
    });
    const denied = (message: string) => fakeClient({ code: "42501", message }).client;
    expect(await saveCreatorTags({ client: denied("로그인이 필요하다"), viewer: HARU }, { tagIds: [CHZZK], customTag: "" })).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(await saveCreatorTags({ client: denied("크리에이터 계정만 고친다"), viewer: HARU }, { tagIds: [CHZZK], customTag: "" })).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});
