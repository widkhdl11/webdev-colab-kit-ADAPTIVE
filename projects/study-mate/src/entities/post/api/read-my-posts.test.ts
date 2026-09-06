import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readMyPosts } from "./read-my-posts";

const 나 = "11111111-1111-4111-8111-111111111111";

type 행 = Record<string, unknown>;

function 모집글(덮어쓸: 행 = {}): 행 {
  return {
    id: "p1",
    title: "토익 900 목표 새벽반 모집",
    created_at: "2026-09-01T00:00:00Z",
    views_count: 12,
    likes_count: 3,
    study: {
      id: "s1",
      title: "토익 새벽반",
      category_id: "language",
      category: { name: "외국어" },
    },
    ...덮어쓸,
  };
}

function 가짜DB(행들: 행[], error: { code?: string; message?: string } | null = null) {
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
        order() {
          return Promise.resolve({ data: 행들, error });
        },
      };
      return q;
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 건조건 };
}

describe("내가 쓴 모집글 조회", () => {
  it("내가 쓴 것만 묻는다 — 모집글 조회는 원래 공개라 정책이 아무것도 안 막는다", async () => {
    const db = 가짜DB([모집글()]);
    await readMyPosts(나, db.factory);

    expect(db.건조건.table).toBe("posts");
    // 이 조건이 없으면 남이 쓴 글 전부가 「내가 쓴 모집글」에 뜬다. 값이 새지는 않지만
    // (이미 공개다) 화면이 통째로 거짓말을 한다.
    expect(db.건조건["eq:author_id"]).toBe(나);
  });

  it("지워진 스터디의 모집글은 뺀다 — 「내가 만든 스터디」에 없는 이름이 여기 뜨면 안 된다", async () => {
    const db = 가짜DB([모집글()]);
    await readMyPosts(나, db.factory);

    // `study_is_visible` 이 「지워지지 않았거나 내가 호스트」라, 이 조건이 없으면
    // 내가 지운 내 스터디의 모집글이 이 목록에 계속 남는다 (INV-Z10).
    expect(db.건조건["is:study.deleted_at"]).toBeNull();
  });

  it("스터디는 `!inner` 다 — 모집글이 보이는 조건이 곧 스터디가 보이는 조건이다", async () => {
    const db = 가짜DB([모집글()]);
    await readMyPosts(나, db.factory);

    expect(db.건조건.columns).toContain("study:studies!inner(");
  });

  it("스터디 이름과 카테고리를 임베드에서 가져온다", async () => {
    const db = 가짜DB([모집글()]);

    const [p] = await readMyPosts(나, db.factory);
    expect(p?.studyTitle).toBe("토익 새벽반");
    expect(p?.categoryId).toBe("language");
    expect(p?.categoryName).toBe("외국어");
    expect(p?.viewsCount).toBe(12);
    expect(p?.likesCount).toBe(3);
  });

  it("임베드에서 키가 빠져 오면 던진다 — 없으면 스터디 이름이 빈 줄이 그려진다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB([
      모집글({ study: { id: "s1", category_id: "language", category: { name: "외국어" } } }),
    ]);

    await expect(readMyPosts(나, db.factory)).rejects.toThrow("내가 쓴 모집글을(를) 읽지 못했다");
    로그.mockRestore();
  });

  it("조회가 실패하면 원문을 밖으로 내보내지 않고 던진다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB([], { code: "42501", message: "permission denied for table posts" });

    await expect(readMyPosts(나, db.factory)).rejects.toThrow("내가 쓴 모집글을(를) 읽지 못했다");
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });
});
