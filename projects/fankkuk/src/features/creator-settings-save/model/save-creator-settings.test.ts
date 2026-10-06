import { describe, expect, it } from "vitest";
import { saveCreatorNotify, saveCreatorProfile } from "./save-creator-settings";

const HARU = { userId: "creator-haru", role: "creator" } as const;

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

describe("크리에이터 공개 정보 저장 (my-account INV-A9)", () => {
  it("INV-A9: 공개 이름·소개글·노출 세 칸만 DB 함수에 넘긴다 — 본문의 크리에이터 ID·채널·본인 확인은 넘기지 않는다", async () => {
    const f = fakeClient();
    const r = await saveCreatorProfile(
      { client: f.client, viewer: HARU },
      { name: "  하루달 ", intro: " 안녕하세요 ", searchable: false, creatorId: "momo", channel: "https://x", identityVerified: true },
    );
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_profile", args: { p_name: "하루달", p_intro: "안녕하세요", p_searchable: false } }]);
  });

  it("INV-A9 S9b (실패경로): 공개 이름 21자·빈 이름·소개글 201자·노출 빈 값은 400, DB 를 부르지 않는다", async () => {
    for (const body of [
      { name: "가".repeat(21), intro: "", searchable: true },
      { name: "   ", intro: "", searchable: true },
      { name: "하루달", intro: "가".repeat(201), searchable: true },
      { name: "하루달", intro: "", searchable: "yes" },
      { name: "하루달", searchable: true },
      null,
    ]) {
      const f = fakeClient();
      expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-A9: 경계 안 — 공개 이름 20자(이모지 한 글자 포함)·소개글 200자는 넘긴다", async () => {
    const f = fakeClient();
    const name = "가".repeat(19) + "🎁";
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name, intro: "나".repeat(200), searchable: true })).toEqual({ ok: true });
    expect(f.calls).toHaveLength(1);
  });

  it("INV-A9 (실패경로): 공개 이름에 제어 문자·보이지 않는 글자가 있으면 400, DB 를 부르지 않는다", async () => {
    for (const bad of ["하루\u200b달", "하루\u200c달", "하루\u200d달", "하루\u2060달", "하루\ufeff달", "하루\u202e달", "하루\n달", "하루\t달", "하루\u0007달", "\u3164", "하루\u00ad달"]) {
      const f = fakeClient();
      expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name: bad, intro: "", searchable: true })).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-A9: 앞뒤의 탭·줄바꿈·전각 공백은 빼고 넘긴다(DB 와 같은 범위)", async () => {
    const f = fakeClient();
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name: "\t\u3000하루달\n ", intro: "\u3000소개\n", searchable: true })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_profile", args: { p_name: "하루달", p_intro: "소개", p_searchable: true } }]);
  });

  it("INV-A9 S9b (실패경로): 로그인하지 않았으면 401, 팬·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeClient();
      expect(await saveCreatorProfile({ client: f.client, viewer }, { name: "하루달", intro: "", searchable: true })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("DB 가 입력을 거부하면 400, 권한을 거부하면 401", async () => {
    const body = { name: "하루달", intro: "", searchable: true };
    expect(await saveCreatorProfile({ client: fakeClient({ code: "22023" }).client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
    expect(await saveCreatorProfile({ client: fakeClient({ code: "42501" }).client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 401 });
    await expect(saveCreatorProfile({ client: fakeClient({ code: "XX000" }).client, viewer: HARU }, body)).rejects.toThrow();
  });
});

describe("크리에이터 알림 저장 (my-account INV-A11)", () => {
  it("INV-A11: 카카오·이메일 두 칸만 넘긴다 — 승인 요청을 끄는 칸은 없다", async () => {
    const f = fakeClient();
    const r = await saveCreatorNotify({ client: f.client, viewer: HARU }, { kakao: false, email: true, approvalRequest: false, accountId: "x" });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_notify", args: { p_notify_kakao: false, p_notify_email: true } }]);
  });

  it("INV-A11 (실패경로): 참·거짓이 아니면 400, 팬이면 403 — DB 를 부르지 않는다", async () => {
    for (const body of [{ kakao: "off", email: true }, { kakao: true }, null]) {
      const f = fakeClient();
      expect(await saveCreatorNotify({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
    const f = fakeClient();
    expect(await saveCreatorNotify({ client: f.client, viewer: { userId: "f", role: "fan" } }, { kakao: true, email: true })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(f.calls).toEqual([]);
  });
});
