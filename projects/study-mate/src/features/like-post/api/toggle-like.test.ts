// 근거 스펙: docs/specs/post-likes.md (INV-L1 멱등 · INV-L3 자기 것만)
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
function fakeDb(rows: { post_id: string; user_id: string }[], opts: { insertError?: { code: string } } = {}) {
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
                    maybeSingle: async () => ({
                      data: rows.find((r) => r.post_id === v1 && r.user_id === v2) ?? null,
                      error: null,
                    }),
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

describe("INV-L1 — 토글은 상태를 뒤집고, 두 번 와도 결과가 같다", () => {
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

describe("INV-L3 — 세션이 없으면 아무것도 안 쓴다", () => {
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
