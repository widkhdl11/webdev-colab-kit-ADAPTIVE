import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { canOpenPost } from "../model/my-study";
import { readMyStudies, readPostableStudies } from "./read-my-studies";

const 나 = "11111111-1111-4111-8111-111111111111";

type 행 = Record<string, unknown>;

function 스터디(덮어쓸: 행 = {}): 행 {
  return {
    id: "s1",
    title: "토익 새벽반",
    category_id: "language",
    max_participants: 5,
    accepted_count: 2,
    recruiting: true,
    category: { name: "외국어" },
    ...덮어쓸,
  };
}

/** 무엇을 물었는지까지 기록하는 가짜. 질의에 건 조건은 여기 안 남기면 아무도 안 붙든다 */
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

describe("내가 만든 스터디 조회", () => {
  it("내가 호스트인 것만, 지워지지 않은 것만 묻는다", async () => {
    const db = 가짜DB([스터디()]);
    await readMyStudies(나, db.factory);

    expect(db.건조건.table).toBe("studies");
    expect(db.건조건["eq:host_id"]).toBe(나);
    // 이 조건이 없으면 내가 지운 스터디가 「내가 만든 스터디」에 되살아난다.
    // 오류가 아니라 정상 화면으로 보인다.
    expect(db.건조건["is:deleted_at"]).toBeNull();
  });

  it("마감한 스터디도 남는다 — 이것이 `readPostableStudies` 와 갈라지는 절반이다", async () => {
    const db = 가짜DB([스터디({ id: "열린것" }), 스터디({ id: "마감", recruiting: false })]);

    const 결과 = await readMyStudies(나, db.factory);
    expect(결과.map((s) => s.id)).toEqual(["열린것", "마감"]);
  });

  it("정원과 인원을 뒤바꾸지 않는다 — 좌석 막대가 그대로 읽는 값이다", async () => {
    const db = 가짜DB([스터디({ max_participants: 10, accepted_count: 3 })]);

    const [s] = await readMyStudies(나, db.factory);
    expect(s?.capacity).toBe(10);
    expect(s?.filled).toBe(3);
  });

  it("카테고리 이름을 임베드에서 가져온다", async () => {
    const db = 가짜DB([스터디({ category_id: "it", category: { name: "IT/개발" } })]);

    const [s] = await readMyStudies(나, db.factory);
    expect(s?.categoryId).toBe("it");
    expect(s?.categoryName).toBe("IT/개발");
  });

  it("계산 컬럼이 빠져서 오면 던진다 — 없으면 모든 스터디에 「마감」 배지가 붙는다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const 빠진행 = 스터디();
    delete 빠진행.recruiting;
    const db = 가짜DB([빠진행]);

    await expect(readMyStudies(나, db.factory)).rejects.toThrow("내가 만든 스터디을(를) 읽지 못했다");
    로그.mockRestore();
  });

  it("조회가 실패하면 원문을 밖으로 내보내지 않고 던진다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = 가짜DB([], { code: "42501", message: "permission denied for table studies" });

    await expect(readMyStudies(나, db.factory)).rejects.toThrow("내가 만든 스터디을(를) 읽지 못했다");
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });
});

describe("모집글을 붙일 수 있는 스터디 조회", () => {
  it("모집 중이 아닌 스터디는 뺀다 (INV-Z14) — 고르게 두면 고른 뒤에 정책이 거부한다", async () => {
    const db = 가짜DB([스터디({ id: "열린것" }), 스터디({ id: "마감", recruiting: false })]);

    const 결과 = await readPostableStudies(나, db.factory);
    expect(결과.map((s) => s.id)).toEqual(["열린것"]);
  });

  it("반대 절반: 모집 중이면 그대로 남는다", async () => {
    const db = 가짜DB([스터디({ id: "열린것", title: "토익 새벽반" })]);

    const 결과 = await readPostableStudies(나, db.factory);
    expect(결과).toEqual([{ id: "열린것", title: "토익 새벽반" }]);
  });
});

describe("모집글을 쓸 수 있나", () => {
  it("모집 중인 스터디가 하나라도 있어야 참이다 — 「있기만 하면」이 아니다 (INV-Z14)", () => {
    const 마감 = { recruiting: false } as never;
    const 열림 = { recruiting: true } as never;

    expect(canOpenPost([])).toBe(false);
    // 이 줄이 이 판정의 핵심이다. 「스터디가 있나」로 판단하면 여기서 참이 나오고,
    // 화면은 작성 페이지로 보낸 뒤 "고를 수 있는 스터디가 없습니다"로 받는다.
    expect(canOpenPost([마감, 마감])).toBe(false);
    expect(canOpenPost([마감, 열림])).toBe(true);
  });
});
