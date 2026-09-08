/**
 * **배포되는 액션 자체를 부르는 검사.** `update-study.test.ts` 는 조립 함수를 직접 부르므로,
 * 액션 파일이 그 조립을 안 거치도록 바뀌어도 전부 초록불이다 — 세션 가드가 프로덕션
 * 경로에서만 빠지는 상태가 만점으로 나온다.
 *
 * 붙드는 것 넷: ① 가드를 거친다 ② 세션이 없으면 데이터베이스에 손도 안 댄다
 * ③ 성공 후 목적지가 **데이터베이스가 돌려준 id** 다(폼 값이 아니다 — 그러면 열린 리다이렉트다)
 * ④ 일정만 실패했으면 **떠나지 않고** 이 화면에 남는다.
 *
 * 근거: docs/specs/auth-session.md INV-A4 · docs/specs/write-authorization.md INV-Z4·Z15
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 스터디 = "33333333-3333-4333-8333-333333333333";
// **데이터베이스가 돌려주는 id 를 폼이 보내는 것과 다르게 둔다.** 같으면 목적지를
// `result.value` 대신 폼의 `studyId` 로 바꿔도 단언이 그대로 통과한다 — 이 파일이 붙든다고
// 적어 둔 「열린 리다이렉트가 아니다」를 검사가 못 가르는 상태가 된다.
const 저장된스터디 = "55555555-5555-4555-8555-555555555555";

let 세션: { id: string } | null = 사용자;
let 일정넣기오류: { code?: string; message?: string } | null = null;
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
      from: (table: string) => {
        if (table === "study_sessions") {
          return {
            select: () => ({ eq: async () => ({ data: [], error: null }) }),
            delete: () => ({ in: async () => ({ error: null }) }),
            insert: async () => ({ error: 일정넣기오류 }),
          };
        }
        return {
          update: () => {
            const chain = {
              eq: () => chain,
              select: () => ({
                maybeSingle: async () => ({ data: { id: 저장된스터디 }, error: null }),
              }),
            };
            return chain;
          },
        };
      },
    };
  },
}));

const { updateStudyAction } = await import("./edit-study");

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = {
    studyId: 스터디,
    title: "새벽 토익반",
    description: "화목 6시에 모입니다",
    categoryId: "language",
    regionCode: "seoul",
    capacity: "6",
    meetingMode: "offline",
  };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  return form;
}

describe("updateStudyAction — 배포되는 액션", () => {
  beforeEach(() => {
    세션 = 사용자;
    일정넣기오류 = null;
    팩토리호출.mockClear();
    다시받기.mockClear();
  });

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    세션 = null;

    await expect(updateStudyAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 저장하고, 데이터베이스가 돌려준 스터디로 보낸다", async () => {
    await expect(updateStudyAction(null, 폼())).rejects.toThrow(`REDIRECT:/studies/${저장된스터디}`);
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });

  it("성공하면 그 스터디의 상세·모집글 목록·프로필·홈·채팅방 목록을 다시 받게 한다", async () => {
    await expect(updateStudyAction(null, 폼())).rejects.toThrow("REDIRECT:");

    // `/chats` 가 들어 있는 이유: 방 목록과 방 안쪽이 스터디 제목을 그린다
    // (`CHAT_ROOM_SELECT` — 2026-09-07 code-reviewer)
    expect(다시받기.mock.calls.flat()).toEqual([
      `/studies/${저장된스터디}`,
      "/posts",
      "/profile",
      "/",
      "/chats",
    ]);
  });

  // **떠나 보내면 무엇이 안 됐는지는 지나간 뒤에 알게 된다.** 여기 남아야 사용자가 일정만
  // 다시 저장할 수 있고, 본문은 이미 저장됐으니 다시 눌러도 덧나지 않는다.
  it("모임 일정만 실패하면 떠나지 않고 무엇이 안 됐는지 값에 실어 준다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    일정넣기오류 = { code: "42501", message: "row-level security" };

    const 결과 = await updateStudyAction(null, 폼({ weekday0: "1", startsAt0: "19:00", endsAt0: "21:00" }));

    expect(결과.ok).toBe(true);
    expect(결과.ok && 결과.value.slotError).not.toBeNull();
    expect(경고).toHaveBeenCalled();
  });
});
