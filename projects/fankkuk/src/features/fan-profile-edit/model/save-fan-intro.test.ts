import { describe, expect, it, vi } from "vitest";
import { FAN_INTRO_MAX, introInputSchema } from "./intro-input";
import { saveFanIntro } from "./save-fan-intro";

// 팬 자기소개 저장의 앞문 (docs/specs/my-account.md INV-A12). DB 는 가짜로 두고, 거를 요청이 DB 에 닿기 전에 멈추는지·DB 에 넘기는 인자가
// 소개 한 칸뿐인지만 본다. 실제 DB 의 사람 확인·필터는 통합 시험(tests/integration/fan-profile-db)이 본다.

function fakeClient(reply: { data?: unknown; error: { code: string } | null } = { data: null, error: null }) {
  const rpc = vi.fn().mockResolvedValue(reply);
  return { client: { rpc } as never, rpc };
}

describe("INV-A12: 소개 입력 경계 — 앞뒤 공백을 뺀 0~100자 한 줄", () => {
  it("INV-A12: 100자·빈 값은 받고 앞뒤 공백은 뺀다", () => {
    expect(FAN_INTRO_MAX).toBe(100);
    expect(introInputSchema.parse({ intro: "  " + "가".repeat(100) + "  " })).toEqual({ intro: "가".repeat(100) });
    expect(introInputSchema.parse({ intro: "" })).toEqual({ intro: "" });
    // 이모지 하나는 한 글자(DB char_length 와 같은 셈)
    expect(introInputSchema.safeParse({ intro: "😀".repeat(100) }).success).toBe(true);
  });

  it("INV-A12 (실패경로): 101자·줄바꿈·보이지 않는 글자는 거부한다", () => {
    expect(introInputSchema.safeParse({ intro: "가".repeat(101) }).success).toBe(false);
    expect(introInputSchema.safeParse({ intro: "첫 줄\n둘째 줄" }).success).toBe(false);
    expect(introInputSchema.safeParse({ intro: "보이지\u200b않음" }).success).toBe(false);
    expect(introInputSchema.safeParse({ intro: 3 }).success).toBe(false);
  });
});

describe("INV-A12: 소개 저장은 세션의 팬 본인만", () => {
  it("INV-A12 (실패경로): 로그인 안 함 401·크리에이터·운영자 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "c1", role: "creator" as const }, 403],
      [{ userId: "o1", role: "operator" as const }, 403],
    ] as const) {
      const f = fakeClient();
      expect(await saveFanIntro({ client: f.client, viewer }, { intro: "안녕" })).toMatchObject({ ok: false, status });
      expect(f.rpc).not.toHaveBeenCalled();
    }
  });

  it("INV-A12 (실패경로): 101자는 DB 를 부르지 않고 400", async () => {
    const f = fakeClient();
    expect(await saveFanIntro({ client: f.client, viewer: { userId: "f1", role: "fan" } }, { intro: "가".repeat(101) })).toMatchObject({ ok: false, status: 400 });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("INV-A12: DB 에는 소개 한 칸만 넘긴다 — 본문의 계정 ID·사진 경로는 넘기지 않는다", async () => {
    const f = fakeClient();
    const r = await saveFanIntro({ client: f.client, viewer: { userId: "f1", role: "fan" } }, { intro: " 반가워요 ", profileId: "f2", photoPath: "x/p-1.webp" });
    expect(r).toEqual({ ok: true, intro: "반가워요" });
    expect(f.rpc.mock.calls).toEqual([["update_my_fan_profile", { p_intro: "반가워요" }]]);
  });

  it("INV-A12 (실패경로): DB 가 필터·꼴로 거부하면(FKF01~03·22023) 400, 사람 확인 실패(42501)는 401", async () => {
    for (const code of ["FKF01", "FKF02", "FKF03", "22023"]) {
      const f = fakeClient({ error: { code } });
      const r = await saveFanIntro({ client: f.client, viewer: { userId: "f1", role: "fan" } }, { intro: "어떤 말" });
      expect(r).toMatchObject({ ok: false, status: 400 });
    }
    const f = fakeClient({ error: { code: "42501" } });
    expect(await saveFanIntro({ client: f.client, viewer: { userId: "f1", role: "fan" } }, { intro: "어떤 말" })).toMatchObject({ ok: false, status: 401 });
  });
});
