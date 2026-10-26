import { describe, expect, it, vi } from "vitest";
import { FAN_INTRO_MAX, profileInputSchema } from "./profile-input";
import { planFanProfileSave } from "./plan-profile-save";
import { saveFanProfile } from "./save-fan-profile";

// 팬 프로필 글 저장의 앞문 (docs/specs/my-account.md INV-A12). DB 는 가짜로 두고, 거를 요청이 DB 에 닿기 전에 멈추는지·DB 에 넘기는 인자가
// 소개·닉네임 두 칸뿐인지, DB 거부가 어느 칸 오류로 가는지 본다. 실제 DB 의 사람 확인·필터·한 처리는 통합 시험(tests/integration/fan-profile-db)이 본다.

function fakeClient(reply: { data?: unknown; error: { code: string } | null } = { data: null, error: null }) {
  const rpc = vi.fn().mockResolvedValue(reply);
  return { client: { rpc } as never, rpc };
}
const FAN = { userId: "f1", role: "fan" as const };

describe("INV-A12: 입력 경계 — 소개는 앞뒤 공백을 뺀 0~100자 한 줄, 닉네임은 가입과 같은 규칙", () => {
  it("INV-A12: 100자·빈 값은 받고 앞뒤 공백은 뺀다", () => {
    expect(FAN_INTRO_MAX).toBe(100);
    expect(profileInputSchema.parse({ intro: "  " + "가".repeat(100) + "  " })).toEqual({ intro: "가".repeat(100) });
    expect(profileInputSchema.parse({ intro: "" })).toEqual({ intro: "" });
    // 이모지 하나는 한 글자(DB char_length 와 같은 셈)
    expect(profileInputSchema.safeParse({ intro: "😀".repeat(100) }).success).toBe(true);
    expect(profileInputSchema.parse({ nickname: " 별사탕 " })).toEqual({ nickname: "별사탕" });
  });

  it("INV-A12 (실패경로): 101자·줄바꿈·보이지 않는 글자·13자 닉네임·빈 본문은 거부한다", () => {
    expect(profileInputSchema.safeParse({ intro: "가".repeat(101) }).success).toBe(false);
    expect(profileInputSchema.safeParse({ intro: "첫 줄\n둘째 줄" }).success).toBe(false);
    expect(profileInputSchema.safeParse({ intro: "보이지​않음" }).success).toBe(false);
    expect(profileInputSchema.safeParse({ intro: 3 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ nickname: "가".repeat(13) }).success).toBe(false);
    expect(profileInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("INV-A12: 저장은 세션의 팬 본인만, 한 번의 DB 호출로", () => {
  it("INV-A12 (실패경로): 로그인 안 함 401·크리에이터·운영자 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "c1", role: "creator" as const }, 403],
      [{ userId: "o1", role: "operator" as const }, 403],
    ] as const) {
      const f = fakeClient();
      expect(await saveFanProfile({ client: f.client, viewer }, { intro: "안녕" })).toMatchObject({ ok: false, status });
      expect(f.rpc).not.toHaveBeenCalled();
    }
  });

  it("INV-A12 (실패경로): 101자 소개·13자 닉네임은 DB 를 부르지 않고 400, 어느 칸인지 알려 준다", async () => {
    const f = fakeClient();
    expect(await saveFanProfile({ client: f.client, viewer: FAN }, { intro: "가".repeat(101) })).toMatchObject({ ok: false, status: 400, field: "intro" });
    expect(await saveFanProfile({ client: f.client, viewer: FAN }, { nickname: "가".repeat(13) })).toMatchObject({ ok: false, status: 400, field: "nickname" });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("INV-A12: DB 에는 소개·닉네임 두 칸만 한 번에 넘긴다 — 본문의 계정 ID·사진 경로는 넘기지 않고, 안 보낸 칸은 null(그대로)", async () => {
    const f = fakeClient();
    const r = await saveFanProfile({ client: f.client, viewer: FAN }, { intro: " 반가워요 ", nickname: " 별사탕 ", profileId: "f2", photoPath: "x/p-1.webp" });
    expect(r).toEqual({ ok: true, intro: "반가워요", nickname: "별사탕" });
    expect(f.rpc.mock.calls).toEqual([["update_my_fan_profile", { p_intro: "반가워요", p_nickname: "별사탕" }]]);
    const g = fakeClient();
    expect(await saveFanProfile({ client: g.client, viewer: FAN }, { nickname: "별사탕" })).toEqual({ ok: true, intro: null, nickname: "별사탕" });
    expect(g.rpc.mock.calls).toEqual([["update_my_fan_profile", { p_intro: null, p_nickname: "별사탕" }]]);
  });

  it("INV-A12 (실패경로): 닉네임 거부(FKU04 겹침 409·FKU05~07 400)는 닉네임 칸, 소개 거부(FKF01~03)는 소개 칸, 22023 은 칸 없이 400, 42501 은 401", async () => {
    const cases: [string, object][] = [
      ["FKU04", { status: 409, field: "nickname", message: "이미 사용 중인 닉네임입니다." }],
      ["FKU05", { status: 400, field: "nickname" }],
      ["FKU06", { status: 400, field: "nickname" }],
      ["FKU07", { status: 400, field: "nickname" }],
      ["FKF01", { status: 400, field: "intro" }],
      ["FKF02", { status: 400, field: "intro", message: "자기소개에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다." }],
      ["FKF03", { status: 400, field: "intro" }],
    ];
    for (const [code, want] of cases) {
      const f = fakeClient({ error: { code } });
      expect([code, await saveFanProfile({ client: f.client, viewer: FAN }, { intro: "어떤 말", nickname: "별사탕" })]).toMatchObject([code, { ok: false, ...want }]);
    }
    const bad = await saveFanProfile({ client: fakeClient({ error: { code: "22023" } }).client, viewer: FAN }, { intro: "어떤 말" });
    expect(bad).toEqual({ ok: false, status: 400, message: "입력한 정보를 확인해 주세요." });
    expect(await saveFanProfile({ client: fakeClient({ error: { code: "42501" } }).client, viewer: FAN }, { intro: "어떤 말" })).toMatchObject({ ok: false, status: 401 });
    await expect(saveFanProfile({ client: fakeClient({ error: { code: "XX000" } }).client, viewer: FAN }, { intro: "어떤 말" })).rejects.toThrow();
  });
});

describe("INV-A12: 저장하기가 보낼 것 — 바뀐 칸만", () => {
  const saved = { nickname: "별빛", intro: "안녕" };

  it("INV-A12: 둘 다 같으면 보내지 않고, 바뀐 칸만 담는다(닉네임은 앞뒤 공백을 빼고 비교)", () => {
    expect(planFanProfileSave({ nickname: " 별빛 ", intro: " 안녕 " }, saved)).toEqual({ kind: "unchanged" });
    expect(planFanProfileSave({ nickname: "별빛", intro: "새 소개" }, saved)).toEqual({ kind: "send", body: { intro: "새 소개" } });
    expect(planFanProfileSave({ nickname: "별사탕 ", intro: "안녕" }, saved)).toEqual({ kind: "send", body: { nickname: "별사탕" } });
    expect(planFanProfileSave({ nickname: "별사탕", intro: "새 소개" }, saved)).toEqual({ kind: "send", body: { intro: "새 소개", nickname: "별사탕" } });
  });

  it("INV-A12 (실패경로): 소개가 규칙에 안 맞으면 소개 칸, 바꾼 닉네임이 안 맞으면 닉네임 칸 — 보내지 않는다", () => {
    expect(planFanProfileSave({ nickname: "별빛", intro: "가".repeat(101) }, saved)).toMatchObject({ kind: "invalid", field: "intro" });
    expect(planFanProfileSave({ nickname: "", intro: "안녕" }, saved)).toMatchObject({ kind: "invalid", field: "nickname" });
    expect(planFanProfileSave({ nickname: "가".repeat(13), intro: "안녕" }, saved)).toMatchObject({ kind: "invalid", field: "nickname" });
    // 바꾸지 않은 닉네임은 검사하지 않는다 — 옛 닉네임이 지금 규칙에 안 맞아도 소개는 저장된다
    expect(planFanProfileSave({ nickname: "가".repeat(13), intro: "새 소개" }, { nickname: "가".repeat(13), intro: "" })).toEqual({ kind: "send", body: { intro: "새 소개" } });
  });
});
