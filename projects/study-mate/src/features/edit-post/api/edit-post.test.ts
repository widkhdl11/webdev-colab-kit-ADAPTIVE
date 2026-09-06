/**
 * **배포되는 액션 자체를 부르는 검사.** `update-post.test.ts` 는 조립 함수를 직접 부르므로,
 * 액션 파일이 그 조립을 안 거치도록 바뀌어도 전부 초록불이다 — 세션 가드가 프로덕션
 * 경로에서만 빠지는 상태가 만점으로 나온다(2026-09-06 test-auditor P1 과 같은 자리).
 *
 * 붙드는 것 셋: ① 가드를 거친다 ② 세션이 없으면 데이터베이스에 손도 안 댄다
 * ③ 성공 후 목적지가 **데이터베이스가 돌려준 id** 다(폼 값이 아니다 — 그러면 열린 리다이렉트다).
 *
 * 근거: docs/specs/auth-session.md INV-A4 · docs/specs/write-authorization.md INV-Z3·Z4
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 글 = "33333333-3333-4333-8333-333333333333";
// **데이터베이스가 돌려주는 id 를 폼이 보내는 것과 다르게 둔다.** 같으면 목적지를
// `result.value` 대신 폼의 `postId` 로 바꿔도 단언이 그대로 통과한다 — 이 파일이 붙든다고
// 적어 둔 「열린 리다이렉트가 아니다」를 검사가 못 가르는 상태가 된다
// (2026-09-06 security-reviewer).
const 저장된글 = "55555555-5555-4555-8555-555555555555";

let 세션: { id: string } | null = 사용자;
const 팩토리호출 = vi.fn();
const 다시받기 = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => 다시받기(p) }));

vi.mock("@/entities/session", async (original) => ({
  ...(await original<typeof import("@/entities/session")>()),
  currentUser: async () => 세션,
}));

vi.mock("@/shared/api/supabase/server-client", () => ({
  createServerSupabase: async () => {
    팩토리호출();
    return {
      from: () => ({
        update: () => {
          const chain = {
            eq: () => chain,
            select: () => ({ maybeSingle: async () => ({ data: { id: 저장된글 }, error: null }) }),
          };
          return chain;
        },
      }),
    };
  },
}));

const { updatePostAction } = await import("./edit-post");

function 폼(): FormData {
  const form = new FormData();
  form.append("postId", 글);
  form.append("title", "새벽 토익반 모집(2기)");
  form.append("content", "화목 6시로 바꿉니다");
  return form;
}

describe("updatePostAction — 배포되는 액션", () => {
  beforeEach(() => {
    세션 = 사용자;
    팩토리호출.mockClear();
    다시받기.mockClear();
  });

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    세션 = null;

    await expect(updatePostAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 저장하고, 데이터베이스가 돌려준 글로 보낸다", async () => {
    await expect(updatePostAction(null, 폼())).rejects.toThrow(`REDIRECT:/posts/${저장된글}`);
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });

  // **고친 값이 상세·목록에 보여야 한다.** 이 두 줄을 지워도 저장은 되므로, 없으면
  // 「저장했는데 옛 제목이 그대로인」 상태가 아무 신호 없이 만들어진다.
  it("성공하면 그 글의 상세·목록·프로필·홈을 다시 받게 한다", async () => {
    await expect(updatePostAction(null, 폼())).rejects.toThrow("REDIRECT:");

    expect(다시받기.mock.calls.flat()).toEqual([`/posts/${저장된글}`, "/posts", "/profile", "/"]);
  });
});
