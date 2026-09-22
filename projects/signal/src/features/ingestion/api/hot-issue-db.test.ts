import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHotIssueDbPorts } from "./hot-issue-db";
import { PICKED_TITLES_LIMIT } from "../lib/budgets";

/**
 * 핫이슈 DB 어댑터 — **실제 쿼리 조립을 검증한다** (hot-issue.md INV-G1 · G2 · G4 · H1).
 *
 * ── 이 파일이 왜 생겼나 (2026-09-21 테스트 감사) ─────────────────────────────
 * 이 코드는 `api/ports.ts` 안에 있었고 그 파일은 `server-only` 라 유닛이 로드조차 못 했다.
 * 단계 테스트는 포트를 전부 가짜로 갈아 끼우므로 **진짜 DB 문이 한 줄도 안 돌았다.**
 *
 * 그 결과 감사가 이런 변이들이 안 잡힌다고 지목했다 — 전부 여기서 잡는다:
 *   저장 update 에서 `hot_issue_answers` 삭제 · 종류 저장 블록 삭제 ·
 *   `assignGates` 를 `gate: null` 로 · `listPickedTitlesToday` 의 문 조건 삭제 ·
 *   후보 조회의 `hot_issue_at is null` 삭제 · 저장 순서 뒤집기
 *
 * 네트워크에 안 붙는다 — 가짜 클라이언트로 **무엇을 어떤 순서로 불렀는지**를 본다.
 * 값이 실제로 DB 에 들어가는지는 `tests/integration/` 이 따로 본다. 둘 다 필요하다:
 * 여기는 게이트가 도는 `npm test` 안에 있고, 저기는 마이그레이션 적용 여부를 본다.
 */

/** 한 번의 체이닝에서 무엇이 불렸는지. */
interface Recorded {
  table: string;
  op: "select" | "update" | "upsert";
  payload?: Record<string, unknown>;
  rows?: unknown;
  is?: [string, unknown];
  eq?: [string, unknown];
  gte?: [string, unknown];
  inValues?: [string, unknown[]];
  order?: string;
  limit?: number;
  select?: string;
}

/**
 * PostgREST 체이닝 흉내 (`entities/article/api/queries.test.ts` 와 같은 방법).
 *
 * **호출 순서를 그대로 기록한다** — 저장 순서가 규칙이라(표시를 마지막에 쓴다) 순서를
 * 못 보면 그 규칙을 붙들 수 없다.
 */
function fakeDb(dataByCall: unknown[][] = [], errorAt: number[] = []) {
  const calls: Recorded[] = [];

  const from = (table: string) => {
    const rec: Recorded = { table, op: "select" };
    const at = calls.length;
    calls.push(rec);
    const data = dataByCall[at] ?? [];
    const error = errorAt.includes(at) ? { message: `호출 ${at} 실패` } : null;

    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        rec.select = cols;
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        rec.op = "update";
        rec.payload = payload;
        return chain;
      },
      upsert: (rows: unknown) => {
        rec.op = "upsert";
        rec.rows = rows;
        return chain;
      },
      is: (col: string, v: unknown) => {
        rec.is = [col, v];
        return chain;
      },
      eq: (col: string, v: unknown) => {
        rec.eq = [col, v];
        return chain;
      },
      gte: (col: string, v: unknown) => {
        rec.gte = [col, v];
        return chain;
      },
      in: (col: string, v: unknown[]) => {
        rec.inValues = [col, v];
        return chain;
      },
      order: (col: string) => {
        rec.order = col;
        return chain;
      },
      limit: (n: number) => {
        rec.limit = n;
        return chain;
      },
      then: (resolve: (r: unknown) => unknown) => resolve({ data, error }),
    };
    return chain;
  };

  return { db: { from } as unknown as SupabaseClient, calls };
}

const NOW = new Date("2026-09-21T12:00:00.000Z");

describe("listHotIssueCandidates — 아직 안 물어본 글만 (INV-G2)", () => {
  it("`hot_issue_at is null` 로 거른다 — 중요도 값으로 거르면 중요도 0 이 영원히 후보다", async () => {
    const { db, calls } = fakeDb([[]]);
    await createHotIssueDbPorts(db).listHotIssueCandidates(120);

    expect(calls[0].table).toBe("item");
    expect(calls[0].is).toEqual(["hot_issue_at", null]);
    expect(calls[0].limit).toBe(120);
  });

  it("본문은 요약글이 빈 건에 대해서만 2차로 받는다 — 한 번에 받으면 최악 2.4MB 다", async () => {
    const { db, calls } = fakeDb([
      [
        { id: "a", title: "있음", source_excerpt: "요약글", source_id: "s", published_at: "x" },
        { id: "b", title: "없음", source_excerpt: "", source_id: "s", published_at: "x" },
      ],
      [{ id: "b", content_html: "<p>본문</p>" }],
    ]);
    await createHotIssueDbPorts(db).listHotIssueCandidates(10);

    expect(calls).toHaveLength(2);
    expect(calls[1].inValues).toEqual(["id", ["b"]]);
  });

  it("요약글이 다 있으면 2차 조회를 아예 안 한다", async () => {
    const { db, calls } = fakeDb([
      [{ id: "a", title: "t", source_excerpt: "요약글", source_id: "s", published_at: "x" }],
    ]);
    await createHotIssueDbPorts(db).listHotIssueCandidates(10);
    expect(calls).toHaveLength(1);
  });
});

describe("listPickedTitlesToday — 오늘 뽑힌 것만 (INV-G4)", () => {
  it("문 값이 있는 글만 본다 — 조건이 빠지면 오늘 모든 제목이 「이미 뽑힘」이 된다", async () => {
    const { db, calls } = fakeDb([[{ title: "뽑힌 글" }]]);
    const got = await createHotIssueDbPorts(db).listPickedTitlesToday(NOW);

    // 이 조건이 빠지면 그날 모든 글이 중복으로 걸려 **매일 0건**이 된다.
    expect(calls[0].eq).toEqual(["gate", "gate1"]);
    expect(got).toEqual(["뽑힌 글"]);
  });

  it("오늘 시작 시각부터 최신순으로 받고 상한을 건다 (2026-09-21)", async () => {
    const { db, calls } = fakeDb([[]]);
    await createHotIssueDbPorts(db).listPickedTitlesToday(NOW);

    expect(calls[0].gte?.[0]).toBe("published_at");
    expect(calls[0].order).toBe("published_at");
    expect(calls[0].limit).toBe(PICKED_TITLES_LIMIT);
  });

  it("빈 제목은 버린다 — 지시문에 빈 따옴표 줄이 생긴다", async () => {
    const { db } = fakeDb([[{ title: "정상" }, { title: "" }, { title: null }]]);
    expect(await createHotIssueDbPorts(db).listPickedTitlesToday(NOW)).toEqual(["정상"]);
  });
});

describe("saveHotIssue — 무엇을 어떤 순서로 쓰나 (INV-G1 · G2 · S31)", () => {
  const row = {
    itemId: "a",
    importance: 2,
    answers: { 변화: true, 방향: false, 기회: true },
    kinds: ["news" as const, "tool" as const],
  };

  it("판정 근거를 같이 쓴다 (S31) — 개수만 남기면 왜 뽑혔는지 못 되짚는다", async () => {
    const { db, calls } = fakeDb();
    await createHotIssueDbPorts(db).saveHotIssue([row]);

    const update = calls.find((c) => c.op === "update");
    expect(update?.payload?.importance).toBe(2);
    expect(update?.payload?.hot_issue_answers).toEqual(row.answers);
  });

  it("종류를 `item_kind` 에 붙인다 (INV-G1) — 한 글이 둘 다일 수 있다", async () => {
    const { db, calls } = fakeDb();
    await createHotIssueDbPorts(db).saveHotIssue([row]);

    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert?.table).toBe("item_kind");
    expect(upsert?.rows).toEqual([
      { item_id: "a", kind: "news" },
      { item_id: "a", kind: "tool" },
    ]);
  });

  it("**종류를 먼저 쓰고 「물어봤다」 표시를 마지막에 쓴다** — 순서가 규칙이다", async () => {
    const { db, calls } = fakeDb();
    await createHotIssueDbPorts(db).saveHotIssue([row]);

    const kindAt = calls.findIndex((c) => c.table === "item_kind");
    const markAt = calls.findIndex((c) => c.payload?.hot_issue_at !== undefined);
    expect(kindAt).toBeGreaterThanOrEqual(0);
    expect(markAt).toBeGreaterThanOrEqual(0);
    // 거꾸로 두면 그 사이에 죽은 글이 표시만 찍힌 채 종류가 영영 빈다 —
    // 다음 주기 후보에서 빠지므로 아무도 다시 채우지 않는다.
    expect(kindAt).toBeLessThan(markAt);
  });

  it("종류가 비어 있으면 `item_kind` 를 아예 안 건드린다", async () => {
    const { db, calls } = fakeDb();
    await createHotIssueDbPorts(db).saveHotIssue([{ ...row, kinds: [] }]);
    expect(calls.some((c) => c.table === "item_kind")).toBe(false);
  });

  it("빈 배열이면 아무것도 안 쓴다", async () => {
    const { db, calls } = fakeDb();
    await createHotIssueDbPorts(db).saveHotIssue([]);
    expect(calls).toHaveLength(0);
  });

  it("실패경로: DB 오류를 삼키지 않고 던진다 — 부르는 쪽이 청크를 실패로 세야 한다", async () => {
    const { db } = fakeDb([], [0]);
    await expect(createHotIssueDbPorts(db).saveHotIssue([row])).rejects.toThrow("호출 0 실패");
  });
});

describe("assignGates — 문 배정 (INV-H1)", () => {
  it("`gate1` 을 쓴다 — null 이나 다른 값이면 화면에서 핫이슈가 통째로 빈다", async () => {
    const { db, calls } = fakeDb();
    await createHotIssueDbPorts(db).assignGates(["a", "b"]);

    expect(calls[0].op).toBe("update");
    expect(calls[0].payload).toEqual({ gate: "gate1" });
    expect(calls[0].inValues).toEqual(["id", ["a", "b"]]);
  });

  it("빈 배열이면 안 부른다", async () => {
    const { db, calls } = fakeDb();
    await createHotIssueDbPorts(db).assignGates([]);
    expect(calls).toHaveLength(0);
  });

  it("실패경로: DB 오류를 던진다 — 부르는 쪽이 리포트에 남겨야 한다", async () => {
    const { db } = fakeDb([], [0]);
    await expect(createHotIssueDbPorts(db).assignGates(["a"])).rejects.toThrow("호출 0 실패");
  });
});
