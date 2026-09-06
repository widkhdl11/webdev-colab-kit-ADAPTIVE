import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { makeRemovePost, removePost } from "./remove-post";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 글 = "33333333-3333-4333-8333-333333333333";
// **폼이 보내는 값과 데이터베이스가 돌려주는 값을 다르게 둔다.** 목적지는 지운 뒤에
// 데이터베이스가 알려 준 스터디여야 한다 — 폼이 실어 보낸 값으로 만들면 그 자리가
// 열린 리다이렉트가 된다 (2026-09-06 security-reviewer 가 수정 액션에서 잡은 것과 같은 자리).
const 스터디 = "22222222-2222-4222-8222-222222222222";
const 다시받기 = vi.fn();

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries({ postId: 글, ...values })) form.append(k, v);
  return form;
}

/** 데이터베이스 대신 쓰는 가짜. **좁히는 조건까지 기록한다** — 인가가 그 조건에 있다 */
function 가짜DB(
  결과: {
    data: { id: string; study_id: string } | null;
    error: { code?: string; message?: string } | null;
  } = { data: { id: 글, study_id: 스터디 }, error: null },
) {
  const 테이블: string[] = [];
  const 좁힌것: [string, unknown][] = [];
  const 고른칸: string[] = [];
  let 지웠나 = false;
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        delete() {
          지웠나 = true;
          const chain = {
            eq(column: string, value: unknown) {
              좁힌것.push([column, value]);
              return chain;
            },
            // **고른 칸을 기록한다.** 안 기록하면 `.select("study_id")` 를 다른 열로 바꿔도
            // 전부 초록불이다 (2026-09-06 test-auditor).
            select: (cols: string) => {
              고른칸.push(cols);
              return {
                maybeSingle: async () => 결과,
                // **`single` 도 달아 둔다.** 안 달면 `.single()` 로 바뀔 때 TypeError 로
                // 죽어서 「단언이 붙들어서」가 아니라 「터져서」 빨간불이 난다. 실제
                // `single()` 은 0행에 PGRST116 **오류**를 내므로, 이 액션의 실패 문구
                // 설계가 통째로 뒤집힌다 — 그 갈래를 문구 단언이 붙들게 한다.
                single: async () =>
                  결과.data === null && 결과.error === null
                    ? { data: null, error: { code: "PGRST116", message: "no rows" } }
                    : 결과,
              };
            },
          };
          return chain;
        },
      };
    },
  }));
  return {
    factory: factory as unknown as typeof createServerSupabase,
    테이블,
    좁힌것,
    고른칸,
    호출: factory,
    get 지웠나() {
      return 지웠나;
    },
  };
}

describe("모집글 삭제 액션", () => {
  beforeEach(() => 다시받기.mockClear());

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const db = 가짜DB();
    const 액션 = makeRemovePost(async () => null, {
      createSupabase: db.factory,
      revalidatePaths: 다시받기,
    });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 지우고, 데이터베이스가 돌려준 스터디를 값으로 준다", async () => {
    const db = 가짜DB();
    const 액션 = makeRemovePost(async () => 사용자, {
      createSupabase: db.factory,
      revalidatePaths: 다시받기,
    });

    await expect(액션(폼())).resolves.toEqual({
      ok: true,
      value: { postId: 글, studyId: 스터디 },
    });
    expect(db.테이블).toEqual(["posts"]);
    expect(db.지웠나).toBe(true);
    // 고른 칸까지 박는다 — 둘 다 캐시 경로가 되므로 하나만 빠져도 화면이 낡는다
    expect(db.고른칸).toEqual(["id, study_id"]);
  });

  // 이것이 이 액션의 인가다. 정책(`posts_delete_author`)이 두 번째 방벽이고 이 줄이 첫 번째다.
  it("INV-Z3: 지울 대상을 「그 글」이자 「내가 쓴 글」로 좁힌다", async () => {
    const db = 가짜DB();

    await removePost(사용자, 폼(), db.factory);

    expect(db.좁힌것).toEqual([
      ["id", 글],
      ["author_id", 사용자.id],
    ]);
  });

  it("INV-Z4(삭제): 누구의 글인지는 폼이 아니라 세션이 정한다 — 폼에 남의 id 를 넣어도 안 쓴다", async () => {
    const db = 가짜DB();
    const 남 = "99999999-9999-4999-8999-999999999999";

    await removePost(사용자, 폼({ author_id: 남, authorId: 남, userId: 남 }), db.factory);

    expect(db.좁힌것).toContainEqual(["author_id", 사용자.id]);
    expect(JSON.stringify(db.좁힌것)).not.toContain(남);
  });

  it("어느 글인지 안 실려 오거나 uuid 표기가 아니면 데이터베이스를 부르지 않는다", async () => {
    const db = 가짜DB();

    await expect(removePost(사용자, 폼({ postId: "" }), db.factory)).resolves.toEqual({
      ok: false,
      message: "어느 모집글을 지우는지 알 수 없습니다",
    });
    // 빈 값만 넣으면 `canonicalUuid` 를 `String(...)` 으로 바꿔도 초록불이다 — 둘 다
    // 거짓이라 같은 자리에서 막힌다 (2026-09-06 test-auditor).
    await expect(removePost(사용자, 폼({ postId: "not-a-uuid" }), db.factory)).resolves.toEqual({
      ok: false,
      message: "어느 모집글을 지우는지 알 수 없습니다",
    });
    // 반대 절반 — 하이픈 없는 32글자는 정규 표기로 바뀌어 통과한다
    await removePost(사용자, 폼({ postId: 글.replace(/-/g, "").toUpperCase() }), db.factory);
    expect(db.좁힌것).toContainEqual(["id", 글]);
    expect(db.호출).toHaveBeenCalledTimes(1);
  });

  // 삭제도 갱신과 같다 — 조건에 안 맞으면 오류 없이 0행이다. 성공으로 읽으면
  // 「지웠습니다」가 나가면서 글은 그대로 남는다.
  it("INV-Z3(실패경로·삭제): 내 글이 아니면 오류 없이 0행이 오고, 그것을 성공으로 읽지 않는다", async () => {
    const db = 가짜DB({ data: null, error: null });

    await expect(removePost(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "지울 수 있는 모집글이 아닙니다. 내가 쓴 글인지 확인해 주세요",
    });
  });

  it("데이터베이스가 거부하면 그 원문을 화면으로 보내지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({
      data: null,
      error: { code: "42501", message: 'permission denied for table "posts"' },
    });

    await expect(removePost(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집글을 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    expect(경고).toHaveBeenCalled();
  });

  // 지운 글의 상세는 이제 없다. 남는 화면들이 그 글을 계속 그리면 안 된다.
  it("지운 뒤에 그 글이 나오던 화면 다섯을 다시 받게 하고, 실패하면 안 지운다", async () => {
    const db = 가짜DB();
    const 액션 = makeRemovePost(async () => 사용자, {
      createSupabase: db.factory,
      revalidatePaths: 다시받기,
    });

    await 액션(폼());
    // **데이터베이스가 돌려준 값으로 지운다** — 폼 값으로 지우면 남의 주소가 들어간다.
    // 지운 글의 상세도 지운다: 뒤로 가기가 라우터 캐시에서 그 화면을 되살린다.
    expect(다시받기.mock.calls).toEqual([
      [`/posts/${글}`, "/posts", "/profile", "/", `/studies/${스터디}`],
    ]);

    다시받기.mockClear();
    const 빈DB = 가짜DB({ data: null, error: null });
    const 실패 = makeRemovePost(async () => 사용자, {
      createSupabase: 빈DB.factory,
      revalidatePaths: 다시받기,
    });
    await 실패(폼());
    expect(다시받기).not.toHaveBeenCalled();
  });
});
