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

  it("INV-A9: 본문에 있는 칸만 DB 에 넘긴다 — 없는 칸은 DB 가 지금 값 그대로 둔다(화면마다 자기 칸만 저장)", async () => {
    const f = fakeClient();
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { searchable: false })).toEqual({ ok: true });
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name: "하루달", intro: "소개", fanName: "" })).toEqual({ ok: true });
    expect(f.calls).toEqual([
      { fn: "update_my_creator_profile", args: { p_searchable: false } },
      { fn: "update_my_creator_profile", args: { p_name: "하루달", p_intro: "소개", p_fan_name: "" } },
    ]);
  });

  it("INV-A9 S9b (실패경로): 공개 이름 21자·빈 이름·소개 41자·소개 줄바꿈·노출 빈 값은 400, DB 를 부르지 않는다", async () => {
    for (const body of [
      { name: "가".repeat(21), intro: "", searchable: true },
      { name: "   ", intro: "", searchable: true },
      { name: "하루달", intro: "가".repeat(41), searchable: true },
      { name: "하루달", intro: "첫 줄\n둘째 줄", searchable: true },
      { name: "하루달", intro: "", searchable: "yes" },
      { name: "하루달", intro: null, searchable: true },
      { searchable: null },
      null,
    ]) {
      const f = fakeClient();
      expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-A9: 경계 안 — 공개 이름 20자(이모지 한 글자 포함)·한 줄 소개 40자는 넘긴다 (creator-link INV-E6)", async () => {
    const f = fakeClient();
    const name = "가".repeat(19) + "🎁";
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name, intro: "나".repeat(40), searchable: true })).toEqual({ ok: true });
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

describe("팬을 부르는 이름 저장 (추가분 4-1)", () => {
  it("팬덤 이름을 보내면 앞뒤 공백을 빼고 p_fan_name 으로 넘긴다 — 빈 문자열은 지우기로 그대로 넘긴다", async () => {
    for (const [input, sent] of [
      ["  꿀벌단 ", "꿀벌단"],
      ["", ""],
      ["가".repeat(9) + "🎁", "가".repeat(9) + "🎁"],
    ] as const) {
      const f = fakeClient();
      expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name: "하루달", intro: "", searchable: true, fanName: input })).toEqual({ ok: true });
      expect(f.calls).toEqual([{ fn: "update_my_creator_profile", args: { p_name: "하루달", p_intro: "", p_searchable: true, p_fan_name: sent } }]);
    }
  });

  it("(실패경로) 팬덤 이름 11자·줄바꿈·보이지 않는 글자·문자열 아님은 400, DB 를 부르지 않는다", async () => {
    for (const fanName of ["가".repeat(11), "꿀벌\n단", "꿀벌 단", "꿀​벌", 3]) {
      const f = fakeClient();
      expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name: "하루달", intro: "", searchable: true, fanName })).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("(실패경로) DB 필터가 거부하면 팬덤 이름 칸의 문구로 알린다 — 한 줄 소개 문구와 섞이지 않는다", async () => {
    for (const [code, text] of [
      ["P0084", "팬을 부르는 이름에 쓸 수 없는 말이 들어 있어요."],
      ["P0085", "팬을 부르는 이름에 전화번호·이메일·인터넷 주소는 쓸 수 없어요."],
      ["P0086", "팬을 부르는 이름에 글자나 숫자를 하나 이상 넣어 주세요."],
    ] as const) {
      const f = fakeClient({ code });
      expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { name: "하루달", intro: "", searchable: true, fanName: "꿀벌단" })).toEqual({
        ok: false,
        status: 400,
        message: text,
      });
    }
  });
});

describe("크리에이터 색 저장 (creator-link INV-E13·E14, my-account INV-A9)", () => {
  it("INV-E13 S12: 퍼스널 컬러 #1e3a8a·팬컬러 #FFF59D 는 대문자 #RRGGBB 로 DB 함수에 넘긴다", async () => {
    const f = fakeClient();
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { personalColor: "#1e3a8a", fanColor: " #FFF59D " })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_profile", args: { p_personal_color: "#1E3A8A", p_fan_color: "#FFF59D" } }]);
  });

  it("INV-E13 S12: 빈 값은 기본 모양으로 되돌리기(빈 문자열), 보내지 않은 색 칸은 넘기지 않는다(팬덤 이름만 저장)", async () => {
    const f = fakeClient();
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { personalColor: "", fanColor: "" })).toEqual({ ok: true });
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { fanName: "달빛지기" })).toEqual({ ok: true });
    expect(f.calls).toEqual([
      { fn: "update_my_creator_profile", args: { p_personal_color: "", p_fan_color: "" } },
      { fn: "update_my_creator_profile", args: { p_fan_name: "달빛지기" } },
    ]);
  });

  it("INV-E13 S12b (실패경로): red·#12345·스타일 문장·# 없는 값·숫자 → 400, DB 를 부르지 않는다(같이 보낸 다른 칸도 안 바뀐다)", async () => {
    for (const bad of ["red", "#12345", "#123456; background:url(x)", "1E3A8A", "#1E3A8A0", "#GGGGGG", 0x1e3a8a, null]) {
      for (const key of ["personalColor", "fanColor"] as const) {
        const f = fakeClient();
        const r = await saveCreatorProfile({ client: f.client, viewer: HARU }, { fanName: "달빛지기", [key]: bad });
        expect(r, `${key}=${String(bad)}`).toMatchObject({ ok: false, status: 400 });
        expect(f.calls).toEqual([]);
      }
    }
  });

  it("INV-E13 S12b (실패경로): 본문의 크리에이터 ID 는 넘기지 않는다 · 팬·로그인 안 함은 DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { personalColor: "#1E3A8A", creatorId: "momo", p_creator_id: "momo" })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_profile", args: { p_personal_color: "#1E3A8A" } }]);
    const fan = fakeClient();
    expect(await saveCreatorProfile({ client: fan.client, viewer: { userId: "fan", role: "fan" } }, { personalColor: "#1E3A8A" })).toMatchObject({ ok: false, status: 403 });
    expect(await saveCreatorProfile({ client: fan.client, viewer: null }, { personalColor: "#1E3A8A" })).toMatchObject({ ok: false, status: 401 });
    expect(fan.calls).toEqual([]);
  });

  it("INV-E14 S13b: 경계 색 #777777 은 거부 없이 넘기고, 본문의 글자색(#FF0000)은 쓰지 않는다", async () => {
    const f = fakeClient();
    expect(await saveCreatorProfile({ client: f.client, viewer: HARU }, { fanColor: "#777777", textColor: "#FF0000", onFan: "#FF0000" })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_profile", args: { p_fan_color: "#777777" } }]);
  });
});
