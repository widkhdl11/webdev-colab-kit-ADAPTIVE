import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { CONTENT_MAX, SUMMARY_MAX, TITLE_MAX } from "@/entities/post/model/limits";
import { makeUpdatePost, updatePost } from "./update-post";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 다시받기 = vi.fn();
const 글 = "33333333-3333-4333-8333-333333333333";
// **폼이 보내는 값과 데이터베이스가 돌려주는 값을 다르게 둔다.** 같으면 성공 값을
// `postId` 로 바꿔도(없는 글·남의 글의 id 가 그대로 캐시 경로로 나간다) 단언이 통과한다
// (2026-09-06 test-auditor).
const 저장된글 = "55555555-5555-4555-8555-555555555555";

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = { postId: 글, title: "새벽 토익반 모집(2기)", content: "화목 6시로 바꿉니다" };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  return form;
}

/**
 * 데이터베이스 대신 쓰는 가짜. **좁히는 조건까지 기록한다** — 갱신에서 `.eq("author_id", …)`
 * 가 빠지면 화면은 그대로 동작하고 정책만이 유일한 방벽이 된다. 값을 안 적어 두면
 * 그 상태를 이 검사가 못 가른다.
 */
function 가짜DB(
  결과: { data: { id: string } | null; error: { code?: string; message?: string } | null } = {
    data: { id: 저장된글 },
    error: null,
  },
) {
  const 보낸것: Record<string, unknown>[] = [];
  const 테이블: string[] = [];
  const 좁힌것: [string, unknown][] = [];
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        update(payload: Record<string, unknown>) {
          보낸것.push(payload);
          const chain = {
            eq(column: string, value: unknown) {
              좁힌것.push([column, value]);
              return chain;
            },
            select: () => ({ maybeSingle: async () => 결과 }),
          };
          return chain;
        },
      };
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 보낸것, 테이블, 좁힌것, 호출: factory };
}

describe("모집글 수정 액션", () => {
  // 이 파일의 `다시받기` 는 모듈 수준 `vi.fn()` 이라 검사 사이에 호출 기록이 남는다
  // (`restoreMocks` 는 `vi.spyOn` 만 되돌린다). 안 지우면 뒤 검사의 「불렀는가」가
  // 앞 검사 덕에 이미 만족돼 있다 (2026-09-06 test-auditor).
  beforeEach(() => 다시받기.mockClear());

  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const db = 가짜DB();
    const 액션 = makeUpdatePost(async () => null, { createSupabase: db.factory, revalidatePaths: 다시받기 });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 갱신하고, 데이터베이스가 돌려준 id 를 값으로 준다", async () => {
    const db = 가짜DB();
    const 액션 = makeUpdatePost(async () => 사용자, { createSupabase: db.factory, revalidatePaths: 다시받기 });

    await expect(액션(폼())).resolves.toEqual({ ok: true, value: 저장된글 });
    expect(db.테이블).toEqual(["posts"]);
  });

  // **고친 값이 상세·목록에 보여야 한다.** 작성 액션은 이것을 안 하는데(새 주소로 떠나므로
  // 그 화면 자체가 처음 그려진다), 수정은 **이미 있던 주소로 돌아간다** — 지우지 않으면
  // 라우터가 들고 있던 옛 화면이 그대로 나오고, 사용자는 저장이 안 된 줄 안다.
  it("성공하면 고친 값이 나오는 화면 넷을 다시 받게 하고, 실패하면 안 지운다", async () => {
    const db = 가짜DB();
    const 액션 = makeUpdatePost(async () => 사용자, { createSupabase: db.factory, revalidatePaths: 다시받기 });

    await 액션(폼());
    // 넷을 통째로 박는다 — 하나를 빼도 초록불이면 「목록만 낡은」 상태가 조용히 생긴다
    // **데이터베이스가 돌려준 id 로 지운다** — 폼 값으로 지우면 남의 글을 고치려 한 요청의
    // id 가 그대로 캐시 경로로 나간다
    expect(다시받기.mock.calls).toEqual([[`/posts/${저장된글}`, "/posts", "/profile", "/"]]);

    다시받기.mockClear();
    const 빈DB = 가짜DB({ data: null, error: null });
    const 실패 = makeUpdatePost(async () => 사용자, { createSupabase: 빈DB.factory, revalidatePaths: 다시받기 });
    await 실패(폼());
    expect(다시받기).not.toHaveBeenCalled();
  });

  // 이것이 이 액션의 인가다. **정책이 두 번째 방벽이고 이 줄이 첫 번째다** —
  // 빠지면 남의 글을 고치라고 보내고 데이터베이스가 조용히 0행을 돌려준다.
  it("INV-Z3: 갱신 대상을 「그 글」이자 「내가 쓴 글」로 좁힌다", async () => {
    const db = 가짜DB();

    await updatePost(사용자, 폼(), db.factory);

    expect(db.좁힌것).toEqual([
      ["id", 글],
      ["author_id", 사용자.id],
    ]);
  });

  it("INV-Z4: 누구의 글인지는 폼이 아니라 세션이 정한다 — 폼에 남의 id 를 넣어도 안 쓴다", async () => {
    // 폼 키 이름을 여럿 심는다. 하나만 심으면 다른 이름을 읽는 구현이 빠져나간다.
    const db = 가짜DB();
    const 남 = "99999999-9999-4999-8999-999999999999";

    await updatePost(사용자, 폼({ author_id: 남, authorId: 남, userId: 남 }), db.factory);

    expect(db.좁힌것).toContainEqual(["author_id", 사용자.id]);
    expect(JSON.stringify(db.보낸것[0])).not.toContain(남);
    expect(JSON.stringify(db.좁힌것)).not.toContain(남);
  });

  // **보내는 세 칸을 통째로 박는다.** 데이터베이스의 갱신 권한도 이 셋뿐이라
  // (`grant update (title, summary, content) on public.posts`), 넷째 칸이 늘면
  // 화면은 그대로인데 요청이 통째로 거부되기 시작한다.
  it("INV-Z8: 보내는 것은 정확히 세 칸이다 — 작성자·스터디는 갱신에 안 실린다", async () => {
    const db = 가짜DB();
    const 남의스터디 = "44444444-4444-4444-8444-444444444444";

    await updatePost(
      사용자,
      폼({ summary: "화목으로 옮겼습니다", studyId: 남의스터디, study_id: 남의스터디 }),
      db.factory,
    );

    expect(db.보낸것[0]).toEqual({
      title: "새벽 토익반 모집(2기)",
      summary: "화목으로 옮겼습니다",
      content: "화목 6시로 바꿉니다",
    });
  });

  it("어느 글인지 안 실려 오면 데이터베이스를 부르지 않는다", async () => {
    const db = 가짜DB();

    await expect(updatePost(사용자, 폼({ postId: "" }), db.factory)).resolves.toEqual({
      ok: false,
      message: "어느 모집글을 고치는지 알 수 없습니다",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("제목이나 내용이 비면 데이터베이스를 부르지 않는다 — 공백만 적은 것도 빈 것이다", async () => {
    const db = 가짜DB();

    await expect(updatePost(사용자, 폼({ title: "   " }), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집글 제목을 적어 주세요",
    });
    await expect(updatePost(사용자, 폼({ content: " \n " }), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집글 내용을 적어 주세요",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  // 문구에 숫자를 박는 이유는 작성 쪽과 같다 — 상수를 import 해서 상대적으로만 보면
  // 상한을 통째로 늘려도 초록불이다.
  it("길이 상한(수정)을 넘기면 거부하고, 딱 맞으면 통과시킨다 — 제목 80 · 소개 80 · 내용 4000", async () => {
    const db = 가짜DB();

    await expect(updatePost(사용자, 폼({ title: "가".repeat(TITLE_MAX + 1) }), db.factory)).resolves.toEqual(
      { ok: false, message: "제목은 80자까지 적을 수 있습니다" },
    );
    expect((await updatePost(사용자, 폼({ title: "가".repeat(TITLE_MAX) }), db.factory)).ok).toBe(true);

    await expect(
      updatePost(사용자, 폼({ summary: "가".repeat(SUMMARY_MAX + 1) }), db.factory),
    ).resolves.toEqual({ ok: false, message: "한 줄 소개는 80자까지 적을 수 있습니다" });
    expect((await updatePost(사용자, 폼({ summary: "가".repeat(SUMMARY_MAX) }), db.factory)).ok).toBe(true);

    await expect(
      updatePost(사용자, 폼({ content: "가".repeat(CONTENT_MAX + 1) }), db.factory),
    ).resolves.toEqual({ ok: false, message: "내용은 4000자까지 적을 수 있습니다" });
    expect((await updatePost(사용자, 폼({ content: "가".repeat(CONTENT_MAX) }), db.factory)).ok).toBe(true);
  });

  it("한 줄 소개를 지우면 null 로 간다 — 안 보낸 것과 지운 것을 가른다", async () => {
    const db = 가짜DB();

    await updatePost(사용자, 폼({ summary: "" }), db.factory);
    expect(db.보낸것[0]?.summary).toBeNull();

    await updatePost(사용자, 폼({ summary: "새벽에 조용히" }), db.factory);
    expect(db.보낸것[1]?.summary).toBe("새벽에 조용히");
  });

  it("문단 구분이 살아서 저장된다 — 폼이 보내는 CRLF 를 LF 로 맞춘다", async () => {
    const db = 가짜DB();

    await updatePost(사용자, 폼({ content: "첫 문단\r\n\r\n둘째 문단" }), db.factory);

    expect(db.보낸것[0]?.content).toBe("첫 문단\n\n둘째 문단");
  });

  // **남의 글을 고치려 하면 여기로 온다.** 좁힌 조건에 안 맞으면 갱신은 0행이고 오류가 아니다.
  // 이 갈래가 없으면 "저장했습니다"가 나가면서 아무것도 안 바뀐다.
  it("INV-Z3(실패경로): 내 글이 아니면 오류 없이 0행이 오고, 그것을 성공으로 읽지 않는다", async () => {
    const db = 가짜DB({ data: null, error: null });

    await expect(updatePost(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "고칠 수 있는 모집글이 아닙니다. 내가 쓴 글인지 확인해 주세요",
    });
  });

  it("데이터베이스가 거부하면 그 원문을 화면으로 보내지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({
      data: null,
      error: { code: "42501", message: 'new row violates row-level security policy for table "posts"' },
    });

    await expect(updatePost(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집글을 수정하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    expect(경고).toHaveBeenCalled();
  });

  it("우리가 지은 문장은 그대로 보여 주고 로그로 보내지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({ data: null, error: { code: "P0001", message: "모집이 닫힌 스터디입니다" } });

    await expect(updatePost(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집이 닫힌 스터디입니다",
    });
    expect(경고).not.toHaveBeenCalled();
  });
});
