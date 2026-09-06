/**
 * **배포되는 액션 자체를 부르는 검사.** `remove-post.test.ts` 는 조립 함수를 직접 부르므로,
 * 액션 파일이 그 조립을 안 거치도록 바뀌어도 전부 초록불이다.
 *
 * 붙드는 것 셋: ① 가드를 거친다 ② 세션이 없으면 데이터베이스에 손도 안 댄다
 * ③ 성공 후 목적지가 **데이터베이스가 돌려준 스터디**다(폼 값이 아니다).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 글 = "33333333-3333-4333-8333-333333333333";
const 스터디 = "22222222-2222-4222-8222-222222222222";

let 세션: { id: string } | null = 사용자;
const 팩토리호출 = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/entities/session", async (original) => ({
  ...(await original<typeof import("@/entities/session")>()),
  currentUser: async () => 세션,
}));

vi.mock("@/shared/api/supabase/server-client", () => ({
  createServerSupabase: async () => {
    팩토리호출();
    return {
      from: () => ({
        delete: () => {
          const chain = {
            eq: () => chain,
            select: () => ({
              maybeSingle: async () => ({ data: { id: 글, study_id: 스터디 }, error: null }),
            }),
          };
          return chain;
        },
      }),
    };
  },
}));

const { deletePostAction } = await import("./delete-post");

function 폼(): FormData {
  const form = new FormData();
  form.append("postId", 글);
  return form;
}

describe("deletePostAction — 배포되는 액션", () => {
  beforeEach(() => {
    세션 = 사용자;
    팩토리호출.mockClear();
  });

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    세션 = null;

    await expect(deletePostAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 지우고, 데이터베이스가 돌려준 스터디로 보낸다", async () => {
    await expect(deletePostAction(null, 폼())).rejects.toThrow(`REDIRECT:/studies/${스터디}`);
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });
});
