// 근거 스펙: docs/specs/post-likes.md (INV-L1 멱등 · INV-L3 자기 것만)
//
// **이 파일의 describe 에는 INV 번호를 안 붙인다.** 커버리지 게이트는 테스트 이름의 INV
// 번호를 세는데, 두 INV 의 강제 위치는 데이터베이스다 — 여기에 번호를 달면 통합 파일을
// 통째로 지워도 「덮였다」로 세어진다(2026-09-16 test-auditor).
//
// **여기서 보는 것은 계약이 아니라 「화면이 옳은 것을 보는가」다.** 누가 무엇을 쓸 수 있는지는
// 데이터베이스 정책이 판정하고 그 판정은 `tests/integration/post-likes.test.ts` 가 붙든다.
// 이 파일이 붙드는 것은 그 위층 — 토글이 상태를 뒤집는가, 같은 요청이 두 번 와도 결과가
// 같은가, 세션이 없으면 아무것도 안 쓰는가, 성공했을 때 화면을 다시 그리게 하는가.

import { describe, expect, it, vi } from "vitest";
import { makeToggleLike, toggleLike } from "./toggle-like";

const POST = "11111111-1111-4111-8111-111111111111";
const USER = { id: "22222222-2222-4222-8222-222222222222" };

/**
 * `likes` 표를 흉내 낸 최소 클라이언트.
 *
 * **검증 대상 자체는 안 흉내 낸다** — 여기서 흉내 내는 것은 데이터베이스이고, 판정하는 것은
 * 그 위에서 도는 토글의 분기다. 정책이 거부하는지는 이 파일이 물을 수 없다(흉내가 거부하면
 * 흉내가 거부한 것이다). 그래서 거부는 `error` 를 그대로 돌려주는 갈래로만 다룬다.
 */
function fakeDb(
  rows: { post_id: string; user_id: string }[],
  opts: {
    insertError?: { code: string };
    /** 조회 자체가 실패하는 경우. 이 갈래가 없으면 실패를 삼키는 코드도 전부 초록이다. */
    selectError?: { code: string; message: string };
    /** 취소가 거부되는 경우. 없으면 delete 의 실패 처리를 통째로 지워도 초록이다. */
    deleteError?: { code: string; message: string };
  } = {},
) {
  const calls = { insert: 0, delete: 0 };
  const client = {
    from(table: string) {
      if (table !== "likes") throw new Error(`이 가짜는 likes 만 안다: ${table}`);
      return {
        select() {
          return {
            eq(_c1: string, v1: string) {
              return {
                eq(_c2: string, v2: string) {
                  return {
                    maybeSingle: async () =>
                      opts.selectError
                        ? { data: null, error: opts.selectError }
                        : {
                            data: rows.find((r) => r.post_id === v1 && r.user_id === v2) ?? null,
                            error: null,
                          },
                  };
                },
              };
            },
          };
        },
        async insert(row: { post_id: string; user_id: string }) {
          calls.insert += 1;
          if (opts.insertError) return { error: opts.insertError };
          rows.push(row);
          return { error: null };
        },
        delete() {
          calls.delete += 1;
          return {
            eq(_c1: string, v1: string) {
              return {
                async eq(_c2: string, v2: string) {
                  if (opts.deleteError) return { error: opts.deleteError };
                  const i = rows.findIndex((r) => r.post_id === v1 && r.user_id === v2);
                  if (i >= 0) rows.splice(i, 1);
                  return { error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, rows, calls };
}

const createSupabase = (db: ReturnType<typeof fakeDb>) => async () => db.client as never;

describe("토글은 상태를 뒤집고, 두 번 와도 결과가 같다", () => {
  it("누른 적이 없으면 넣는다", async () => {
    const db = fakeDb([]);
    const r = await toggleLike(USER, POST, createSupabase(db));
    expect(r).toEqual({ ok: true, value: { liked: true } });
    expect(db.rows).toEqual([{ post_id: POST, user_id: USER.id }]);
  });

  it("이미 눌렀으면 지운다", async () => {
    // 「넣는다」만 보면 토글을 insert 전용으로 바꿔도 통과한다 — 반대 절반이다.
    const db = fakeDb([{ post_id: POST, user_id: USER.id }]);
    const r = await toggleLike(USER, POST, createSupabase(db));
    expect(r).toEqual({ ok: true, value: { liked: false } });
    expect(db.rows).toEqual([]);
  });

  it("경합으로 같은 요청이 두 번 도착해 유일 제약에 걸려도 사용자에게는 성공이다", async () => {
    // 스펙 S6: 「그 실패가 사용자에게 에러로 나가면 안 된다」. 23505 는 이미 눌려 있다는
    // 뜻이고, 사용자가 원한 상태가 이미 이뤄진 것이라 알릴 실패가 없다.
    const db = fakeDb([], { insertError: { code: "23505" } });
    const r = await toggleLike(USER, POST, createSupabase(db));
    expect(r).toEqual({ ok: true, value: { liked: true } });
  });

  it("그 밖의 데이터베이스 오류는 실패로 돌려준다", async () => {
    // 23505 하나만 삼키는지 본다. 전부 삼키면 정책 거부(42501)까지 「성공」이 된다.
    const db = fakeDb([], { insertError: { code: "42501" } });
    const r = await toggleLike(USER, POST, createSupabase(db));
    expect(r.ok).toBe(false);
  });

  it("모집글 아이디가 없으면 아무것도 안 쓴다", async () => {
    const db = fakeDb([]);
    const r = await toggleLike(USER, "", createSupabase(db));
    expect(r.ok).toBe(false);
    expect(db.calls).toEqual({ insert: 0, delete: 0 });
  });
});

describe("세션이 없으면 아무것도 안 쓴다", () => {
  it("로그인하지 않았으면 쓰기 자체가 안 일어난다", async () => {
    const db = fakeDb([]);
    const run = makeToggleLike(async () => null, {
      createSupabase: createSupabase(db),
      revalidate: () => true,
    });
    const form = new FormData();
    form.set("postId", POST);
    const r = await run(form);
    expect(r.ok).toBe(false);
    expect(db.calls).toEqual({ insert: 0, delete: 0 });
  });

  it("사용자 아이디는 폼이 아니라 세션에서 온다", async () => {
    // 폼에 남의 아이디를 실어 보내도 그 값이 쓰기에 안 실린다.
    const db = fakeDb([]);
    const run = makeToggleLike(async () => USER as never, {
      createSupabase: createSupabase(db),
      revalidate: () => true,
    });
    const form = new FormData();
    form.set("postId", POST);
    form.set("userId", "99999999-9999-4999-8999-999999999999");
    await run(form);
    expect(db.rows).toEqual([{ post_id: POST, user_id: USER.id }]);
  });
});

describe("성공하면 화면을 다시 그리게 한다", () => {
  it("revalidate 를 그 모집글 경로로 부른다", async () => {
    // 이 단언이 없으면 revalidate 호출을 지워도 전 스위트가 초록이다 — 쓰기는 됐는데
    // 화면만 낡은 상태가 아무 신호 없이 만들어진다.
    const db = fakeDb([]);
    const revalidate = vi.fn(() => true);
    const run = makeToggleLike(async () => USER as never, { createSupabase: createSupabase(db), revalidate });
    const form = new FormData();
    form.set("postId", POST);
    await run(form);
    expect(revalidate).toHaveBeenCalledWith("/posts", POST);
  });

  it("실패하면 다시 그리지 않는다", async () => {
    const db = fakeDb([], { insertError: { code: "42501" } });
    const revalidate = vi.fn(() => true);
    const run = makeToggleLike(async () => USER as never, { createSupabase: createSupabase(db), revalidate });
    const form = new FormData();
    form.set("postId", POST);
    await run(form);
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("데이터베이스가 거부하면 실패로 돌려준다", () => {
  it("조회가 실패하면 취소하려던 요청이 누름으로 뒤집히지 않는다", async () => {
    // **이 갈래가 없으면 실패를 삼키는 코드가 초록이다.** 조회 실패를 「안 눌렀음」으로
    // 읽으면 insert 로 가고, 그 insert 는 23505 를 삼켜 `liked: true` 를 돌려준다 —
    // 사용자는 취소를 눌렀는데 눌린 상태가 돌아오고 실패는 아무 데도 안 뜬다.
    const db = fakeDb([{ post_id: POST, user_id: USER.id }], {
      selectError: { code: "08006", message: "connection failure" },
    });
    const r = await toggleLike(USER, POST, createSupabase(db));
    expect(r.ok).toBe(false);
    expect(db.calls.insert).toBe(0);
    expect(db.calls.delete).toBe(0);
    expect(db.rows).toHaveLength(1); // 행은 그대로다
  });

  it("취소가 거부 아닌 이유로 실패해도 실패로 돌려준다", async () => {
    // **42501 검사만으로는 아래 일반 갈래를 아무도 안 붙든다** — 실제로 그 줄을 지워도
    // 전부 초록이었다. 거부가 아닌 실패(연결 끊김 등)를 따로 봐야 두 갈래가 다 붙들린다.
    const db = fakeDb([{ post_id: POST, user_id: USER.id }], {
      deleteError: { code: "08006", message: "connection failure" },
    });
    const r = await toggleLike(USER, POST, createSupabase(db));
    expect(r.ok).toBe(false);
    expect(db.rows).toHaveLength(1);
  });

  it("취소가 거부되면 실패로 돌려준다", async () => {
    const db = fakeDb([{ post_id: POST, user_id: USER.id }], {
      deleteError: { code: "42501", message: "denied" },
    });
    const r = await toggleLike(USER, POST, createSupabase(db));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("지금은 좋아요를 취소할 수 없습니다");
    expect(db.rows).toHaveLength(1);
  });
});
