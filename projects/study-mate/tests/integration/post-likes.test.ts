// 근거 스펙: docs/specs/post-likes.md (INV-L1 · INV-L2 · INV-L3 · INV-L4 · INV-L5) ·
//            0001_init.sql (likes 표 · likes_unique · on delete cascade · 정책 셋) ·
//            0002_review_fixes.sql:148 (likes_count(posts) 계산 함수)
//
// **여기 있는 계약은 전부 이미 구현돼 있던 것이다.** 2026-09-16 까지 그것을 확인하는 검사가
// 하나도 없었다 — 구현이 있다는 것과 그것이 계약이라는 것은 다르다. 검사가 없으면 다음
// 사람이 「좋아요순 정렬이 느리다」는 이유로 `posts.likes_count` 열을 더해도 아무것도
// 빨갛게 되지 않는다.
//
// **여기서 판정하는 쓰기는 전부 공개 키 연결로 보낸다.** 그 키는 브라우저 번들에도 들어가는
// 값이라, 이 연결로 할 수 있는 일이 곧 「아무나 할 수 있는 일」이다. 서버 액션의 검사는
// 이 경로에 없다 — 정책이 막는지를 묻는 것이므로 그것이 맞다.
//
// 개수는 **세는 쪽**으로 정해져 있다(스펙 「정해야 할 것」). 그래서 이 파일은 어딘가에
// 쌓인 숫자를 읽지 않는다 — 다만 「행을 직접 센다」만으로는 부족하다. 그것은 원본에서
// 지우고 원본을 세는 항등식이라 계산 함수를 통째로 지워도 초록이기 때문이다.
// 그래서 개수는 세 눈으로 본다: 행 직접(`개수`) · 앱이 읽는 계산 열(`앱개수`) ·
// 비로그인 눈(`공개개수`).

import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, cleanupCreatedUsers, createStudy, createUser, rawClient, type TestUser } from "./helpers";

let 작성자: TestUser;
let 다른사람: TestUser;
let studyId: string;
let postId: string;
/** 카탈로그(제약·정책 정의)를 물어보는 연결 — 공개 키로는 못 읽는다. */
let db: Client;

async function 모집글만들기(): Promise<string> {
  const { data, error } = await admin
    .from("posts")
    .insert({ author_id: 작성자.id, study_id: studyId, title: "좋아요 시험용 모집글", content: "본문" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`모집글 생성 실패: ${error?.message}`);
  return (data as { id: string }).id;
}

/** 좋아요 행을 **직접** 센다. 쌓아 둔 숫자를 읽지 않는 것이 INV-L2 의 요구다. */
async function 개수(id = postId): Promise<number> {
  const { count, error } = await admin
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", id);
  if (error) throw new Error(`개수 조회 실패: ${error.message}`);
  return count ?? 0;
}

/**
 * **앱이 실제로 읽는 개수.** `개수()` 는 likes 행을 직접 세는데, 그것만 보면
 * 「원본에서 지우고 원본을 센다」는 항등식이라 어떤 구현으로 바꿔도 초록이다 —
 * 계산 함수 `likes_count(public.posts)` 를 통째로 지워도 잡히지 않았다.
 * 스펙 S3 의 Then 이 말하는 「다음 조회의 개수」는 화면이 읽는 이 값이다.
 */
async function 앱개수(id = postId): Promise<number> {
  const { data, error } = await admin.from("posts").select("likes_count").eq("id", id).single();
  if (error || !data) throw new Error(`앱 개수 조회 실패: ${error?.message}`);
  return (data as { likes_count: number }).likes_count;
}

/**
 * **비로그인 눈으로 본 개수.** 계산 함수는 security definer 가 아니고(0002:147),
 * 그 근거로 주석이 든 것이 `likes_read` 의 공개성이다. 그 정책을 자기 것만 보이게
 * 조이면 모두의 개수가 조용히 줄어드는데, admin 으로만 세면 그것이 안 보인다.
 */
async function 공개개수(id = postId): Promise<number> {
  const { data, error } = await anonClient().from("posts").select("likes_count").eq("id", id).single();
  if (error || !data) throw new Error(`공개 개수 조회 실패: ${error?.message}`);
  return (data as { likes_count: number }).likes_count;
}

const 누르기 = (who: TestUser, id = postId, as = who.id) =>
  who.client.from("likes").insert({ post_id: id, user_id: as });

const 취소 = (who: TestUser, id = postId, whose = who.id) =>
  who.client.from("likes").delete().eq("post_id", id).eq("user_id", whose);

beforeAll(async () => {
  작성자 = await createUser("좋아요작성자");
  다른사람 = await createUser("좋아요구경꾼");
  studyId = await createStudy(작성자.id);
  postId = await 모집글만들기();
  db = await rawClient();
}, 60_000);

// **정리는 단언 뒤가 아니라 여기서 한다.** 블록 끝줄에 `취소` 를 두면, 잡고 싶은 변이가
// 났을 때 그 단언이 먼저 던져서 정리가 안 돌고 행이 남는다 — 다음 블록의 기대값이 밀려
// 엉뚱한 블록이 같이 빨개지고 원인 귀속이 흐려진다. 원시 연결로 지우는 것은 정리가
// 접근 정책에 기대지 않게 하려는 것이다(정책을 무력화하는 변이에도 정리는 돌아야 한다).
afterEach(async () => {
  await db?.query("delete from public.likes where post_id = $1", [postId]);
});

afterAll(async () => {
  await db?.end();
  await cleanupCreatedUsers();
});

describe("INV-L1 — 한 사람은 한 모집글에 좋아요를 하나만 가진다", () => {
  it("S1: 같은 사람이 두 번 눌러도 행은 하나다", async () => {
    await 누르기(다른사람);
    const 두번째 = await 누르기(다른사람);
    // **코드까지 본다.** 토글은 23505 를 「이미 원한 상태가 됐다」로 읽고 삼키는데
    // (`toggle-like.ts`), 제약을 트리거 같은 다른 장치로 옮기면 코드가 달라져서
    // 정상 재요청이 사용자에게 오류로 나간다. 존재만 보면 그 변경이 안 잡힌다.
    expect(두번째.error?.code).toBe("23505");
    expect(await 개수()).toBe(1);
  });

  it("S1b: 서로 다른 두 사람이 누르면 개수는 2 다", async () => {
    // 유일 제약을 (post_id) 로 잘못 걸면 여기서 빨간불이 난다 — S1 만으로는 그 실수가 안 보인다.
    await 누르기(다른사람);
    await 누르기(작성자);
    expect(await 개수()).toBe(2);
    expect(await 앱개수()).toBe(2);
  });

  it("S2: 다시 누르면(취소) 행이 없어진다", async () => {
    await 누르기(다른사람);
    expect(await 개수()).toBe(1);
    const r = await 취소(다른사람);
    expect(r.error).toBeNull();
    expect(await 개수()).toBe(0);
    expect(await 앱개수()).toBe(0);
  });

  it("S6: 같은 사람의 동시 요청 둘 중 하나만 들어가고 최종 상태는 행 하나다", async () => {
    const [a, b] = await Promise.all([누르기(다른사람), 누르기(다른사람)]);
    const 성공 = [a, b].filter((r) => r.error === null).length;
    expect(성공).toBe(1);
    expect(await 개수()).toBe(1);
  });
});

describe("INV-L2 — 개수는 좋아요 행에서 파생된다", () => {
  it("S3: 행을 직접 지우면 다음 조회의 개수가 따라 준다", async () => {
    await 누르기(다른사람);
    await 누르기(작성자);
    expect(await 개수()).toBe(2);

    // 앱을 안 거치고 행 하나를 지운다. 숫자를 어딘가에 쌓아 두는 구현이면 여기서 2 가 나온다.
    await db.query("delete from public.likes where post_id = $1 and user_id = $2", [postId, 작성자.id]);
    expect(await 개수()).toBe(1);

    // **여기가 스펙 S3 의 Then 이다** — 「다음 조회의 개수」는 화면이 읽는 값이다.
    // 이 줄이 없으면 계산 함수를 통째로 지워도, posts 에 카운터를 쌓고 그것을 읽게 바꿔도
    // 이 파일 전체가 초록이었다(2026-09-16 test-auditor).
    expect(await 앱개수()).toBe(1);

    // 비로그인 눈으로도 같은 값이어야 한다. 계산 함수는 definer 가 아니라 호출자 권한으로
    // 세므로, `likes_read` 를 자기 것만 보이게 조이면 모두의 개수가 조용히 줄어든다.
    expect(await 공개개수()).toBe(1);
  });

  it("INV-L5: posts 에 개수를 쌓아 두는 열이 없다", async () => {
    // 스펙이 금지하는 것은 「대조 검사 없는 파생 열」이다. 열이 생기는 순간 이 검사가
    // 빨간불이 되고, 그때 대조 테스트를 같이 들고 오게 만드는 것이 이 줄의 일이다.
    //
    // **이름에 like 가 들었는지로 보지 않는다.** 그러면 `fav_count`·`heart_count`·
    // `popularity` 로 이름만 바꿔 쌓으면 통과한다. 세는 열 전체를 훑고 알고 있는 것
    // 하나만 남기는 허용 목록으로 뒤집는다.
    //
    // **이 줄을 고쳐서 통과시키려는 사람에게**: 여기 이름을 더하려면 그 열이 원본에서
    // 다시 세어 대조하는 테스트를 같이 들고 와야 한다. 그게 INV-L5 의 조건이다.
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'posts'`,
    );
    const 세는열 = rows.map((r) => r.column_name).filter((c) => /_count$|count_|^likes?$|like/.test(c));
    expect(세는열.sort()).toEqual(["views_count"]);
  });
});

describe("INV-L3 — 자기 좋아요만 만들고 지운다", () => {
  it("S4: 남의 이름으로 넣으면 거부된다", async () => {
    const r = await 누르기(다른사람, postId, 작성자.id);
    // 42501 = 접근 정책이 거부했다. 존재만 보면 컬럼명 오타 같은 무관한 실패도 초록이다.
    expect(r.error?.code).toBe("42501");
    expect(await 개수()).toBe(0);
  });

  it("S4b: 남의 좋아요는 지워지지 않는다", async () => {
    await 누르기(작성자);
    await 취소(다른사람, postId, 작성자.id);
    expect(await 개수()).toBe(1); // 남아 있다
  });

  it("S4c: 자기 것은 넣고 지울 수 있다", async () => {
    // 이 줄이 없으면 정책을 「전부 거부」로 바꿔도 S4·S4b 가 통과한다.
    const 넣기 = await 누르기(다른사람);
    expect(넣기.error).toBeNull();
    expect(await 개수()).toBe(1);
    const 지우기 = await 취소(다른사람);
    expect(지우기.error).toBeNull();
    expect(await 개수()).toBe(0);
  });

  it("S4d: 로그인하지 않은 연결은 거부된다", async () => {
    const { error } = await anonClient()
      .from("likes")
      .insert({ post_id: postId, user_id: 다른사람.id });
    expect(error?.code).toBe("42501");
    expect(await 개수()).toBe(0);
  });
});

describe("INV-L4 — 모집글이 사라지면 좋아요도 사라진다", () => {
  it("S5: 글을 지우면 그 글의 좋아요 행이 없어진다", async () => {
    const 임시 = await 모집글만들기();
    await 누르기(다른사람, 임시);
    expect(await 개수(임시)).toBe(1);

    const { error } = await admin.from("posts").delete().eq("id", 임시);
    expect(error).toBeNull();
    expect(await 개수(임시)).toBe(0);
  });
});
