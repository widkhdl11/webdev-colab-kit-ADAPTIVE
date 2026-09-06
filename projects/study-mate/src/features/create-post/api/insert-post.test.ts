import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { CONTENT_MAX, SUMMARY_MAX, TITLE_MAX } from "@/entities/post/model/limits";
import { insertPost, makeCreatePost } from "./insert-post";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 스터디 = "22222222-2222-4222-8222-222222222222";

/** 폼에 들어온 값. 검사마다 필요한 것만 덮어쓴다 */
function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = { studyId: 스터디, title: "새벽 토익반 모집", content: "월수금 6시에 모입니다" };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  return form;
}

/**
 * 데이터베이스 대신 쓰는 가짜. **검증 대상은 여기 없다** — 붙드는 것은 "우리가 무엇을
 * 보내는가"이고, 그 값이 정책을 통과하는지는 통합 검사가 실제 데이터베이스에 대고 본다
 * (tests/integration/write-authorization.test.ts 의 INV-Z9).
 */
function 가짜DB(결과: { data: { id: string } | null; error: { code?: string } | null } = {
  data: { id: "33333333-3333-4333-8333-333333333333" },
  error: null,
}) {
  const 보낸것: Record<string, unknown>[] = [];
  const 테이블: string[] = [];
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        insert(payload: Record<string, unknown>) {
          보낸것.push(payload);
          return { select: () => ({ single: async () => 결과 }) };
        },
      };
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 보낸것, 테이블, 호출: factory };
}

describe("모집글 작성 액션", () => {
  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const db = 가짜DB();
    const 액션 = makeCreatePost(async () => null, db.factory);

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 가드가 넘겨준 사용자가 그대로 작성자가 된다", async () => {
    const db = 가짜DB();
    const 액션 = makeCreatePost(async () => 사용자, db.factory);

    await expect(액션(폼())).resolves.toEqual({
      ok: true,
      value: "33333333-3333-4333-8333-333333333333",
    });
    expect(db.테이블).toEqual(["posts"]);
    // 조립이 본체에 넘기는 값이 곧 author_id 다. 이 단언이 없으면 조립에서 고정 id 를
    // 넘기도록 바꿔도 전부 초록불이다 — 그러면 정책이 전부 거부해 기능이 통째로 죽는다.
    expect(db.보낸것[0]?.author_id).toBe(사용자.id);
  });

  it("INV-Z4: 작성자는 폼이 아니라 세션에서 온다 — 폼에 남의 id 를 넣어도 무시된다", async () => {
    const db = 가짜DB();
    const 남 = "99999999-9999-4999-8999-999999999999";

    await insertPost(사용자, 폼({ author_id: 남, authorId: 남 }), db.factory);

    expect(db.보낸것[0]?.author_id).toBe(사용자.id);
    expect(JSON.stringify(db.보낸것[0])).not.toContain(남);
  });

  // 이름에 INV-Z9 를 달지 않는다. 여기서 붙드는 것은 표기 정규화뿐이고, 「그 스터디의
  // 호스트인가」는 정책이 판정한다 — 그 커버는 통합 검사에 있다
  // (tests/integration/write-authorization.test.ts 의 INV-Z9). 이름에 INV 를 달면
  // 커버리지 집계에서 유닛도 그것을 붙드는 것처럼 보인다.
  it("고른 스터디의 표기를 데이터베이스와 같은 값으로 맞춰 보낸다", async () => {
    const db = 가짜DB();

    await insertPost(사용자, 폼({ studyId: 스터디.replace(/-/g, "").toUpperCase() }), db.factory);

    expect(db.보낸것[0]?.study_id).toBe(스터디);
  });

  it("스터디를 안 고르면 데이터베이스를 부르지 않고 무엇이 빠졌는지 말한다", async () => {
    const db = 가짜DB();

    await expect(insertPost(사용자, 폼({ studyId: "" }), db.factory)).resolves.toEqual({
      ok: false,
      message: "어느 스터디의 모집글인지 골라 주세요",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("제목이나 내용이 비면 데이터베이스를 부르지 않는다 — 공백만 적은 것도 빈 것이다", async () => {
    const db = 가짜DB();

    await expect(insertPost(사용자, 폼({ title: "   " }), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집글 제목을 적어 주세요",
    });
    await expect(insertPost(사용자, 폼({ content: " \n " }), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집글 내용을 적어 주세요",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  // **문구에 숫자를 박는다.** 검사가 같은 상수를 import 해서 상대적으로만 보면
  // `TITLE_MAX = 80` 을 800000 으로 바꿔도 전부 초록불이다 — 상한이 조용히 사라진다.
  it("길이 상한(작성)을 넘기면 거부하고, 딱 맞으면 통과시킨다 — 제목 80 · 소개 80 · 내용 4000", async () => {
    const db = 가짜DB();

    await expect(insertPost(사용자, 폼({ title: "가".repeat(TITLE_MAX + 1) }), db.factory)).resolves.toEqual(
      { ok: false, message: "제목은 80자까지 적을 수 있습니다" },
    );
    expect((await insertPost(사용자, 폼({ title: "가".repeat(TITLE_MAX) }), db.factory)).ok).toBe(true);

    await expect(
      insertPost(사용자, 폼({ summary: "가".repeat(SUMMARY_MAX + 1) }), db.factory),
    ).resolves.toEqual({ ok: false, message: "한 줄 소개는 80자까지 적을 수 있습니다" });
    expect((await insertPost(사용자, 폼({ summary: "가".repeat(SUMMARY_MAX) }), db.factory)).ok).toBe(
      true,
    );

    await expect(
      insertPost(사용자, 폼({ content: "가".repeat(CONTENT_MAX + 1) }), db.factory),
    ).resolves.toEqual({ ok: false, message: "내용은 4000자까지 적을 수 있습니다" });
    expect((await insertPost(사용자, 폼({ content: "가".repeat(CONTENT_MAX) }), db.factory)).ok).toBe(
      true,
    );
  });

  it("한 줄 소개는 안 적어도 되고, 안 적으면 null 로 간다", async () => {
    const db = 가짜DB();

    await insertPost(사용자, 폼(), db.factory);
    expect(db.보낸것[0]?.summary).toBeNull();

    await insertPost(사용자, 폼({ summary: "새벽에 조용히" }), db.factory);
    expect(db.보낸것[1]?.summary).toBe("새벽에 조용히");
  });

  // **보내는 다섯 칸을 통째로 박는다.** 값만 하나씩 보면 컬럼 이름 오타나 `content` 를
  // 통째로 빼먹은 상태가 전부 초록불이다 — 실제 스키마는 `content not null` 이라 그러면
  // 기능이 100% 죽는데 가짜는 무엇을 보내든 성공을 돌려준다.
  it("보내는 것은 정확히 다섯 칸이다 — 스키마 컬럼과 눈으로 대조할 수 있게", async () => {
    const db = 가짜DB();

    await insertPost(사용자, 폼({ summary: "조용히 풀고 틀린 것만" }), db.factory);

    expect(db.보낸것[0]).toEqual({
      author_id: 사용자.id,
      study_id: 스터디,
      title: "새벽 토익반 모집",
      summary: "조용히 풀고 틀린 것만",
      content: "월수금 6시에 모입니다",
    });
  });

  // 브라우저 폼은 textarea 의 줄바꿈을 전부 CRLF 로 보낸다. 본문을 문단으로 나누는 쪽은
  // 줄바꿈이 연달아 두 번 오는 것을 찾으므로, 정규화가 없으면 본문 전체가 한 문단이 된다.
  it("문단 구분이 살아서 저장된다 — 폼이 보내는 CRLF 를 LF 로 맞춘다", async () => {
    const db = 가짜DB();

    await insertPost(사용자, 폼({ content: "첫 문단\r\n\r\n둘째 문단" }), db.factory);

    expect(db.보낸것[0]?.content).toBe("첫 문단\n\n둘째 문단");
  });

  // `.maybeSingle()` 로 바뀌는 날 정상 경로가 되는 갈래다. 지금 이 단언이 없으면
  // `if (error || !data)` 를 `if (error)` 로 줄여도 전부 초록불이고, 그때는 폼 오류가
  // 아니라 500 이 나가면서 사용자가 적은 것이 사라진다.
  it("행이 안 돌아오면 던지지 않고 실패를 반환한다", async () => {
    const db = 가짜DB({ data: null, error: null });

    await expect(insertPost(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "모집글 작성하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
  });

  // 반대 절반. 우리가 지은 한국어 문장(P0001)은 덮지 않는다 — 덮으면 사용자는 왜 안 되는지
  // 모른 채 재시도만 한다(결정 D20, 2026-09-05).
  it("우리가 지은 문장은 그대로 보여 주고 로그로 보내지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({
      data: null,
      error: { code: "P0001", message: "정원을 넘겨 수락할 수 없습니다: 정원 5, 수락 5" } as {
        code?: string;
      },
    });

    await expect(insertPost(사용자, 폼(), db.factory)).resolves.toEqual({
      ok: false,
      message: "정원을 넘겨 수락할 수 없습니다: 정원 5, 수락 5",
    });
    expect(경고).not.toHaveBeenCalled();
  });

  it("데이터베이스가 거부하면 그 원문을 화면으로 보내지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB({
      data: null,
      error: { code: "42501", message: 'new row violates row-level security policy for table "posts"' } as {
        code?: string;
      },
    });

    const 결과 = await insertPost(사용자, 폼(), db.factory);

    expect(결과).toEqual({
      ok: false,
      message: "모집글 작성하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    expect(경고).toHaveBeenCalled();
  });
});
