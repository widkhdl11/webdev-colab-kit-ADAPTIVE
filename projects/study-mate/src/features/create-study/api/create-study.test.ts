/**
 * **배포되는 액션 자체를 부르는 검사.** `insert-study.test.ts` 는 조립 함수를 직접 부르므로,
 * 액션 파일이 가짜 판독기를 끼우도록 바뀌어도 전부 초록불이었다
 * (2026-09-06 code-reviewer · test-auditor).
 *
 * 붙드는 것 셋: ① 가드를 거친다 ② 목적지가 데이터베이스가 돌려준 id 다(폼 값이 아니다 —
 * 그러면 열린 리다이렉트다) ③ 일정만 실패해도 폼에 안 남기고 그 스터디로 보낸다.
 *
 * 근거: docs/specs/auth-session.md INV-A4
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 새스터디 = "22222222-2222-4222-8222-222222222222";

let 세션: { id: string } | null = 사용자;
let 일정오류: { code?: string; message?: string } | null = null;
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
      from: (table: string) => ({
        insert: (_payload: unknown) =>
          table === "studies"
            ? { select: () => ({ single: async () => ({ data: { id: 새스터디 }, error: null }) }) }
            : Promise.resolve({ error: 일정오류 }),
      }),
    };
  },
}));

const { createStudyAction } = await import("./create-study");

function 폼(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = {
    title: "새벽 토익반",
    description: "월수금 6시에 모여서 같이 풉니다",
    categoryId: "language",
    regionCode: "11",
    capacity: "8",
    meetingMode: "offline",
  };
  for (const [k, v] of Object.entries({ ...기본, ...extra })) form.append(k, v);
  return form;
}

describe("createStudyAction — 배포되는 액션", () => {
  beforeEach(() => {
    세션 = 사용자;
    일정오류 = null;
    팩토리호출.mockClear();
  });

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    세션 = null;

    await expect(createStudyAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 저장하고, 데이터베이스가 돌려준 스터디로 보낸다", async () => {
    await expect(createStudyAction(null, 폼())).rejects.toThrow(`REDIRECT:/studies/${새스터디}`);
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });

  it("일정만 실패해도 폼에 남기지 않고 그 스터디로 보낸다 — 남기면 다시 제출해 하나 더 생긴다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    일정오류 = { code: "08006", message: "nope" };

    await expect(
      createStudyAction(null, 폼({ weekday0: "0", startsAt0: "09:00", endsAt0: "11:00" })),
    ).rejects.toThrow(`REDIRECT:/studies/${새스터디}?slots=failed`);
    로그.mockRestore();
  });
});
