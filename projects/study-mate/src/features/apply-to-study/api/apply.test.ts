/**
 * **배포되는 액션 자체를 부르는 검사.** `insert-application.test.ts` 는 조립 함수를 직접
 * 부르므로, 액션 파일이 `makeApply()` 에 가짜 판독기를 끼우도록 바뀌어도 전부 초록불이었다
 * — 세션 가드가 프로덕션 경로에서만 빠지는 상태가 만점으로 나온다
 * (2026-09-06 code-reviewer · test-auditor).
 *
 * 근거: docs/specs/auth-session.md INV-A4
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 스터디 = "22222222-2222-4222-8222-222222222222";

let 세션: { id: string } | null = 사용자;
const 팩토리호출 = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/entities/session", async (original) => ({
  ...(await original<typeof import("@/entities/session")>()),
  currentUser: async () => 세션,
}));

vi.mock("@/shared/api/supabase/server-client", () => ({
  createServerSupabase: async () => {
    팩토리호출();
    return { from: () => ({ insert: async () => ({ error: null }) }) };
  },
}));

const { applyToStudyAction } = await import("./apply");

function 폼(): FormData {
  const form = new FormData();
  form.append("studyId", 스터디);
  form.append("postId", "33333333-3333-4333-8333-333333333333");
  return form;
}

describe("applyToStudyAction — 배포되는 액션", () => {
  beforeEach(() => {
    세션 = 사용자;
    팩토리호출.mockClear();
  });

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    세션 = null;

    await expect(applyToStudyAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 가드를 지나 실제로 쓴다", async () => {
    await expect(applyToStudyAction(null, 폼())).resolves.toEqual({ ok: true, value: null });
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });
});
