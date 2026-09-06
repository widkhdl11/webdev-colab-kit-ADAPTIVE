/**
 * **배포되는 액션 자체를 부르는 검사.** `send-message.test.ts`·`mark-read.test.ts` 는 조립
 * 함수를 직접 부르므로, 액션 파일이 가짜 판독기를 끼우도록 바뀌어도 전부 초록불이었다
 * (2026-09-06 code-reviewer · test-auditor).
 *
 * 근거: docs/specs/auth-session.md INV-A4
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 방 = "22222222-2222-4222-8222-222222222222";

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
    const chain = {
      eq: () => chain,
      then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return {
      from: () => ({
        insert: async () => ({ error: null }),
        update: () => chain,
      }),
    };
  },
}));

const { markChatRead, sendMessageAction } = await import("./chat-actions");

function 폼(): FormData {
  const form = new FormData();
  form.append("chatId", 방);
  form.append("content", "안녕하세요");
  return form;
}

describe("chat 액션 — 배포되는 이름", () => {
  beforeEach(() => {
    세션 = 사용자;
    팩토리호출.mockClear();
  });

  it("INV-A4: 세션이 없으면 sendMessageAction 이 데이터베이스에 손도 대지 않는다", async () => {
    세션 = null;

    await expect(sendMessageAction(null, 폼())).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 가드를 지나 실제로 쓴다", async () => {
    await expect(sendMessageAction(null, 폼())).resolves.toEqual({ ok: true, value: null });
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });

  it("INV-A4: markChatRead 도 세션이 없으면 데이터베이스에 손도 안 댄다", async () => {
    세션 = null;

    // 결과를 안 돌려주는 자리라 「던지지 않는다」와 「안 썼다」로 본다.
    await expect(markChatRead(방)).resolves.toBeUndefined();
    expect(팩토리호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 markChatRead 가 실제로 쓴다", async () => {
    await markChatRead(방);
    expect(팩토리호출).toHaveBeenCalledTimes(1);
  });
});
