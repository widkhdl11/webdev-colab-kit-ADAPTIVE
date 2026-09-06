/**
 * **배포되는 액션 자체를 부르는 검사.** `insert-post.test.ts` 는 조립 함수를 직접 부르므로,
 * 액션 파일이 그 조립을 안 거치도록 바뀌어도 전부 초록불이었다 — 세션 가드가 프로덕션
 * 경로에서만 빠지는 상태가 만점으로 나온다(2026-09-06 test-auditor P1).
 *
 * 붙드는 것 셋: ① 가드를 거친다 ② 세션이 없으면 데이터베이스에 손도 안 댄다
 * ③ 성공 후 목적지가 **데이터베이스가 돌려준 id** 다(폼 값이 아니다 — 그러면 열린 리다이렉트다).
 *
 * 근거: docs/specs/auth-session.md INV-A4 · docs/specs/write-authorization.md INV-Z4
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 스터디 = "22222222-2222-4222-8222-222222222222";
const 새글 = "33333333-3333-4333-8333-333333333333";

let 세션: { id: string } | null = 사용자;
const 팩토리호출 = vi.fn();

vi.mock("next/navigation", () => ({
  // redirect 는 실제로도 던져서 함수를 끝낸다. 목적지를 문장에 실어 단언한다.
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

vi.mock("@/entities/session", async (original) => ({
  ...(await original<typeof import("@/entities/session")>()),
  currentUser: async () => 세션,
}));

vi.mock("@/shared/api/supabase/server-client", () => ({
  createServerSupabase: async () => {
    팩토리호출();
    return {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 새글 }, error: null }) }) }),
      }),
    };
  },
}));

const { createPostAction } = await import("./create-post");

function 폼(): FormData {
  const form = new FormData();
  form.append("studyId", 스터디);
  form.append("title", "새벽 토익반 모집");
  form.append("content", "월수금 6시에 모입니다");
  return form;
}

describe("createPostAction — 배포되는 액션", () => {
  beforeEach(() => {
    세션 = 사용자;
    팩토리호출.mockClear();
  });

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    세션 = null;

    await expect(createPostAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 저장하고, 데이터베이스가 돌려준 글로 보낸다", async () => {
    await expect(createPostAction(null, 폼())).rejects.toThrow(`REDIRECT:/posts/${새글}`);
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });
});
