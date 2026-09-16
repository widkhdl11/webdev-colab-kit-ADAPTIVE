// 근거 스펙: docs/specs/post-likes.md (INV-L1 · INV-L2 · INV-L3 · INV-L4 · INV-L5) ·
//            supabase/migrations/0024_post_likes.sql
//
// **여기서 판정하는 쓰기는 전부 공개 키 연결로 보낸다.** 그 키는 브라우저 번들에도 들어가는
// 값이라, 이 연결로 할 수 있는 일이 곧 「아무나 할 수 있는 일」이다. 서버 액션의 검사는
// 이 경로에 없다 — 정책이 막는지를 묻는 것이므로 그것이 맞다.
//
// 개수는 **세는 쪽**으로 정해져 있다(스펙 「정해야 할 것」). 그래서 이 파일의 개수 확인은
// 전부 `post_likes` 를 직접 세고, 어딘가에 쌓인 숫자를 읽지 않는다.

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", id);
  if (error) throw new Error(`개수 조회 실패: ${error.message}`);
  return count ?? 0;
}

const 누르기 = (who: TestUser, id = postId, as = who.id) =>
  who.client.from("post_likes").insert({ post_id: id, user_id: as });

const 취소 = (who: TestUser, id = postId, whose = who.id) =>
  who.client.from("post_likes").delete().eq("post_id", id).eq("user_id", whose);

beforeAll(async () => {
  작성자 = await createUser("좋아요작성자");
  다른사람 = await createUser("좋아요구경꾼");
  studyId = await createStudy(작성자.id);
  postId = await 모집글만들기();
  db = await rawClient();
}, 60_000);

afterAll(async () => {
  await db?.end();
  await cleanupCreatedUsers();
});

describe("INV-L1 — 한 사람은 한 모집글에 좋아요를 하나만 가진다", () => {
  it("S1: 같은 사람이 두 번 눌러도 행은 하나다", async () => {
    await 누르기(다른사람);
    const 두번째 = await 누르기(다른사람);
    expect(두번째.error).not.toBeNull(); // 유일 제약이 잡는다
    expect(await 개수()).toBe(1);
    await 취소(다른사람);
  });

  it("S1b: 서로 다른 두 사람이 누르면 개수는 2 다", async () => {
    // 유일 제약을 (post_id) 로 잘못 걸면 여기서 빨간불이 난다 — S1 만으로는 그 실수가 안 보인다.
    await 누르기(다른사람);
    await 누르기(작성자);
    expect(await 개수()).toBe(2);
    await 취소(다른사람);
    await 취소(작성자);
  });

  it("S2: 다시 누르면(취소) 행이 없어진다", async () => {
    await 누르기(다른사람);
    expect(await 개수()).toBe(1);
    const r = await 취소(다른사람);
    expect(r.error).toBeNull();
    expect(await 개수()).toBe(0);
  });

  it("S6: 같은 사람의 동시 요청 둘 중 하나만 들어가고 최종 상태는 행 하나다", async () => {
    const [a, b] = await Promise.all([누르기(다른사람), 누르기(다른사람)]);
    const 성공 = [a, b].filter((r) => r.error === null).length;
    expect(성공).toBe(1);
    expect(await 개수()).toBe(1);
    await 취소(다른사람);
  });
});

describe("INV-L2 — 개수는 좋아요 행에서 파생된다", () => {
  it("S3: 행을 직접 지우면 다음 조회의 개수가 따라 준다", async () => {
    await 누르기(다른사람);
    await 누르기(작성자);
    expect(await 개수()).toBe(2);

    // 앱을 안 거치고 행 하나를 지운다. 숫자를 어딘가에 쌓아 두는 구현이면 여기서 2 가 나온다.
    await db.query("delete from public.post_likes where post_id = $1 and user_id = $2", [postId, 작성자.id]);
    expect(await 개수()).toBe(1);
    await 취소(다른사람);
  });

  it("INV-L5: posts 에 개수를 쌓아 두는 열이 없다", async () => {
    // 스펙이 금지하는 것은 「대조 검사 없는 파생 열」이다. 열이 생기는 순간 이 검사가
    // 빨간불이 되고, 그때 대조 테스트를 같이 들고 오게 만드는 것이 이 줄의 일이다.
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'posts'`,
    );
    const 파생열 = rows.map((r) => r.column_name).filter((c) => /like/.test(c));
    expect(파생열).toEqual([]);
  });
});

describe("INV-L3 — 자기 좋아요만 만들고 지운다", () => {
  it("S4: 남의 이름으로 넣으면 거부된다", async () => {
    const r = await 누르기(다른사람, postId, 작성자.id);
    expect(r.error).not.toBeNull();
    expect(await 개수()).toBe(0);
  });

  it("S4b: 남의 좋아요는 지워지지 않는다", async () => {
    await 누르기(작성자);
    await 취소(다른사람, postId, 작성자.id);
    expect(await 개수()).toBe(1); // 남아 있다
    await 취소(작성자);
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
      .from("post_likes")
      .insert({ post_id: postId, user_id: 다른사람.id });
    expect(error).not.toBeNull();
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
