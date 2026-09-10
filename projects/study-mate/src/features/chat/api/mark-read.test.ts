import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { makeMarkRead, touchLastRead } from "./mark-read";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 방 = "22222222-2222-4222-8222-222222222222";

/**
 * 데이터베이스 대신 쓰는 가짜. .eq() 는 몇 번이든 이어 붙을 수 있고 await 이 결과를
 * 준다 — 실제 supabase-js 도 그렇다. 조건을 하나 지운 변이가 여기서 통과해 버리면
 * 이 검사가 아무것도 안 붙드는 것이 된다.
 *
 * **행 수는 흉내내지 않는다.** 구현이 .select() 를 안 붙이므로 실제로도 몇 행이
 * 갱신됐는지 안 돌아온다 — 그 판단의 근거는 mark-read.ts 에 적혀 있다.
 */
function 가짜DB(error: { message?: string } | null = null) {
  const 보낸것: Record<string, unknown>[] = [];
  const 필터: [string, unknown][] = [];
  const 테이블: string[] = [];
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        update(payload: Record<string, unknown>) {
          보낸것.push(payload);
          const chain = {
            eq(column: string, value: unknown) {
              필터.push([column, value]);
              return chain;
            },
            then(resolve: (v: { error: typeof error }) => unknown) {
              return Promise.resolve({ error }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  }));
  return {
    createSupabase: factory as unknown as typeof createServerSupabase,
    보낸것,
    필터,
    테이블,
    호출: factory,
  };
}

const 액션으로 = (db: ReturnType<typeof 가짜DB>, 세션: typeof 사용자 | null) =>
  makeMarkRead(async () => 세션, { createSupabase: db.createSupabase });

describe("읽음 표시 액션", () => {
  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const db = 가짜DB();

    await expect(액션으로(db, null)(방)).resolves.toEqual({
      ok: false,
      message: NO_SESSION_MESSAGE,
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-Z8(앱 쪽 절반): SET 절에 담는 것은 last_read_at 하나뿐이다", async () => {
    const db = 가짜DB();

    await expect(액션으로(db, 사용자)(방)).resolves.toEqual({ ok: true, value: null });
    expect(db.테이블).toEqual(["chat_participants"]);
    expect(db.보낸것).toEqual([{ last_read_at: null }]);
  });

  it("INV-M2(앱 쪽 절반): 앱은 시각을 만들지 않는다 — 자리만 보내고 값은 데이터베이스가 넣는다", async () => {
    const db = 가짜DB();

    await 액션으로(db, 사용자)(방);

    // **`null` 인 것 자체가 판정이다.** 여기 무슨 시각이든 실리면 그 값은 앱 서버 시계에서
    // 온 것이고, 안 읽은 수를 가르는 반대편(chat_messages.created_at)은 데이터베이스
    // 시계다. 두 시계가 어긋나면 오류 없이 틀린 숫자가 나온다 (INV-M2, 0021 의 트리거).
    //
    // 옛 검사는 「값이 지금 시각 근처인가」를 봤는데, 그 단언은 앱이 시각을 만드는 것을
    // 전제로 한다 — 지금은 만드는 것 자체가 위반이다.
    expect(db.보낸것[0]?.last_read_at).toBeNull();
  });

  it("대상은 「이 방의 나」다 — user_id 조건이 빠지면 방 전체의 읽음 시각을 민다", async () => {
    const db = 가짜DB();

    await 액션으로(db, 사용자)(방);

    // 순서가 아니라 「둘 다 걸렸는가」를 본다. 길이 단언이 같은 열을 두 번 거는 변이를 잡는다.
    expect(new Map(db.필터)).toEqual(
      new Map([
        ["chat_id", 방],
        ["user_id", 사용자.id],
      ]),
    );
    expect(db.필터).toHaveLength(2);
  });

  it("방을 모르면 데이터베이스를 부르지 않는다", async () => {
    const db = 가짜DB();

    await expect(액션으로(db, 사용자)("")).resolves.toEqual({
      ok: false,
      message: "어느 방인지 알 수 없습니다",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  // 이름에서 「조용히 성공으로 말하지 않는다」를 뺐다 — 이 구현은 .select() 를 안 붙이므로
  // 0행 갱신과 성공을 구분하지 못한다. 붙드는 것은 **오류가 왔을 때** 실패로 돌려준다는
  // 것 하나뿐이다 (2026-09-06 test-auditor: 안 붙드는 것을 이름이 주장하면 다음 사람이
  // 그 자리를 이미 덮인 것으로 읽는다).
  it("데이터베이스가 오류를 내면 실패로 돌려준다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ message: "permission denied" });

    const result = await touchLastRead(사용자, 방, db.createSupabase);

    expect(result.ok).toBe(false);
    로그.mockRestore();
  });
});
