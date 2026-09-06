/**
 * 수정 화면을 여느냐 마느냐를 정하는 판독기. **이 파일이 없을 때는 `.eq("author_id", …)` 와
 * `.is("study.deleted_at", null)` 을 둘 다 지워도 전 스위트가 초록불이었다**
 * (2026-09-06 code-reviewer · test-auditor).
 *
 * 근거: docs/specs/write-authorization.md INV-Z3(수정은 작성자만) · INV-Z10(지워진 스터디)
 */
import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readPostForEdit } from "./read-post-for-edit";

const 나 = "11111111-1111-4111-8111-111111111111";
const 글 = "33333333-3333-4333-8333-333333333333";

type 행 = Record<string, unknown>;

function 모집글(덮어쓸: 행 = {}): 행 {
  return {
    id: 글,
    title: "새벽 토익반 모집",
    summary: null,
    content: "월수금 6시에 모입니다",
    study: { id: "s1", title: "토익 새벽반" },
    ...덮어쓸,
  };
}

function 가짜DB(행: 행 | null, error: { code?: string; message?: string } | null = null) {
  const 건조건: Record<string, unknown> = {};
  const factory = vi.fn(async () => ({
    from(table: string) {
      건조건.table = table;
      const q = {
        select(columns: string) {
          건조건.columns = columns;
          return q;
        },
        eq(c: string, v: unknown) {
          건조건[`eq:${c}`] = v;
          return q;
        },
        is(c: string, v: unknown) {
          건조건[`is:${c}`] = v;
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: 행, error }),
      };
      return q;
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 건조건 };
}

describe("수정할 모집글 조회", () => {
  it("INV-Z3: 「그 글」이자 「내가 쓴 글」로 좁혀서 묻는다", async () => {
    const db = 가짜DB(모집글());
    await readPostForEdit(글, 나, db.factory);

    expect(db.건조건.table).toBe("posts");
    expect(db.건조건["eq:id"]).toBe(글);
    // 이 조건이 없으면 남의 글이 칸에 채워진 채로 수정 화면이 열린다. 저장은 정책이
    // 막지만, 사용자는 다 적은 뒤에야 막힌다.
    expect(db.건조건["eq:author_id"]).toBe(나);
  });

  it("INV-Z10: 지워진 스터디의 모집글은 빼고 묻는다 — 호스트에게는 계속 보이기 때문이다", async () => {
    const db = 가짜DB(모집글());
    await readPostForEdit(글, 나, db.factory);

    // `!inner` 만으로는 안 걸린다. `study_is_visible` 이 「안 지워졌거나 내가 호스트」라,
    // 작성자=호스트인 이 화면에서는 지워진 스터디의 글도 통과한다.
    expect(db.건조건["is:study.deleted_at"]).toBeNull();
    expect(String(db.건조건.columns)).toContain("studies!inner");
  });

  it("없으면 null 이고 오류가 아니다 — 없는 글과 남의 글이 화면에서 같아야 한다", async () => {
    const db = 가짜DB(null);

    await expect(readPostForEdit(글, 나, db.factory)).resolves.toBeNull();
  });

  it("화면이 쓰는 다섯 칸을 그대로 옮긴다", async () => {
    const db = 가짜DB(모집글({ summary: "조용히 풀고 틀린 것만" }));

    await expect(readPostForEdit(글, 나, db.factory)).resolves.toEqual({
      id: 글,
      title: "새벽 토익반 모집",
      summary: "조용히 풀고 틀린 것만",
      content: "월수금 6시에 모입니다",
      studyId: "s1",
      studyTitle: "토익 새벽반",
    });
  });

  // PostgREST 는 임베드에서 못 만든 키를 오류 없이 빼고 돌려준다. 확인하지 않으면
  // `undefined` 가 `string` 자리를 통과해 스터디 이름 없는 화면이 그려진다.
  it("임베드가 비면 던진다 — 값 없이 그리지 않는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB(모집글({ study: undefined }));

    await expect(readPostForEdit(글, 나, db.factory)).rejects.toThrow("수정할 모집글");
    expect(경고).toHaveBeenCalled();
  });

  it("모양 오류 로그에 사람이 쓴 글을 안 싣는다 — 키와 타입만 찍는다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB(모집글({ study: undefined, content: "여기 적은 본문이 로그로 새면 안 된다" }));

    await expect(readPostForEdit(글, 나, db.factory)).rejects.toThrow("수정할 모집글");
    const 찍힌것 = String(경고.mock.calls[0]?.[0] ?? "");
    expect(찍힌것).not.toContain("여기 적은 본문이 로그로 새면 안 된다");
    expect(찍힌것).toContain("content:string");
  });

  it("데이터베이스가 거부하면 원문을 문구에 안 담고 던진다", async () => {
    const 경고 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB(null, { code: "22P02", message: 'invalid input syntax for type uuid: "abc"' });

    await expect(readPostForEdit(글, 나, db.factory)).rejects.toThrow("수정할 모집글을(를) 읽지 못했다");
    expect(경고).toHaveBeenCalled();
  });
});
