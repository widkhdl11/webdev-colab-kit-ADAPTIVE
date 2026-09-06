/**
 * **배포되는 액션 자체를 부르는 검사.** `change-status.test.ts` 는 조립 함수를 직접 부르므로,
 * 액션 파일이 `makeChangeParticipation()` 에 가짜 판독기를 끼우도록 바뀌어도 전부 초록불이었다
 * — 비로그인 요청이 남의 스터디 멤버를 강퇴하는 상태가 만점으로 나온다
 * (2026-09-06 code-reviewer · test-auditor).
 *
 * 근거: docs/specs/auth-session.md INV-A4
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 호스트 = { id: "11111111-1111-4111-8111-111111111111" };
const 신청자 = "22222222-2222-4222-8222-222222222222";
const 스터디 = "33333333-3333-4333-8333-333333333333";

let 세션: { id: string } | null = 호스트;
const 팩토리호출 = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/entities/session", async (original) => ({
  ...(await original<typeof import("@/entities/session")>()),
  currentUser: async () => 세션,
}));

vi.mock("@/shared/api/supabase/server-client", () => ({
  createServerSupabase: async () => {
    팩토리호출();
    const chain = {
      eq: () => chain,
      select: async () => ({ data: [{ id: "44444444-4444-4444-8444-444444444444" }], error: null }),
    };
    return { from: () => ({ update: () => chain }) };
  },
}));

const { changeParticipationAction } = await import("./manage");

function 폼(): FormData {
  const form = new FormData();
  form.append("studyId", 스터디);
  form.append("targetUserId", 신청자);
  form.append("next", "accepted");
  return form;
}

describe("changeParticipationAction — 배포되는 액션", () => {
  beforeEach(() => {
    세션 = 호스트;
    팩토리호출.mockClear();
  });

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    세션 = null;

    await expect(changeParticipationAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 가드를 지나 실제로 쓴다", async () => {
    await expect(changeParticipationAction(null, 폼())).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });
});
