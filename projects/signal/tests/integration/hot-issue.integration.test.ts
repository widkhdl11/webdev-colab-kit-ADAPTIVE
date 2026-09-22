import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 0008_hot_issue.sql 이 **실제로 적용됐는지** — hot-issue.md INV-G1 · H1 · H2.
 *
 * `tests/hot-issue-schema.test.ts` 는 SQL 파일이 스펙대로 생겼는지만 본다. 파일이 옳아도
 * 적용을 안 했으면 그쪽은 통과한다. 여기서는 살아 있는 DB 에 넣어 보고 거절당하는지 본다.
 *
 * **적용 전에는 전부 실패하고 적용 후에 전부 통과한다.** 그것이 이 파일의 용도다.
 *
 * 실행: `npm run test:integration` (SUPABASE_SECRET_KEY 필요 — RLS 를 우회해 쓰기까지 한다).
 * 환경변수가 없으면 건너뛰지 않고 실패한다 — 조용히 건너뛰면 "통과했다"로 읽힌다.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

/**
 * 제약 위반의 코드값. **"거절당했다"만 보면 안 되는 이유가 여기 있다** —
 * 마이그레이션을 안 돌렸을 때도 거절당하지만 그때 코드는 `PGRST204`(모르는 칸)다.
 * 사유까지 봐야 이 파일이 "적용 전 빨간불 · 적용 후 초록불"이 된다.
 */
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION_HINT =
  "제약 위반(23514)이 아니다. PGRST204 면 0008 마이그레이션을 아직 안 돌린 것이다";

let db: SupabaseClient;
const created: string[] = [];

beforeAll(() => {
  if (!url || !secret) {
    throw new Error(
      "통합 테스트에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY 가 필요하다.\n" +
        "값은 .env 가 아니라 셸/OS 환경변수로 넣는다 (protect-secrets 훅 참조).",
    );
  }
  db = createClient(url, secret, { auth: { persistSession: false } });
});

afterAll(async () => {
  if (created.length > 0) await db.from("item").delete().in("canonical_url", created);
});

/** 항목 하나를 넣고 id 를 돌려준다. 뒷정리는 afterAll 이 canonical_url 로 지운다. */
async function insertItem(suffix: string, extra: Record<string, unknown> = {}) {
  const canonicalUrl = `https://example.test/hot-issue/${suffix}-${Date.now()}`;
  created.push(canonicalUrl);
  const res = await db
    .from("item")
    .insert({
      canonical_url: canonicalUrl,
      original_url: canonicalUrl,
      title: "핫이슈 통합 테스트 항목",
      source_id: "test",
      source_name: "테스트",
      published_at: "2026-09-20T00:00:00.000Z",
      ...extra,
    })
    .select("id")
    .single();
  return res;
}

describe("0008 적용 확인 — INV-H2 중요도는 저장하고 이슈성은 저장하지 않는다", () => {
  it("INV-H2: 중요도 칸에 0~3 이 들어간다", async () => {
    for (const importance of [0, 1, 2, 3]) {
      const res = await insertItem(`importance-${importance}`, { importance });
      expect(res.error, `중요도 ${importance} 가 거절됐다: ${res.error?.message}`).toBeNull();
    }
  });

  it("INV-H2 실패경로: 0~3 밖은 DB 가 거절한다 — 제약이 실제로 걸려 있다", async () => {
    // **거절 사유까지 본다.** 마이그레이션을 안 돌린 상태에서도 "거절당했다"는 참이 된다
    // (그 칸이 없으니까). 그러면 이 검사가 적용 전에도 통과해서 아무것도 안 붙든다.
    const tooBig = await insertItem("importance-4", { importance: 4 });
    expect(tooBig.error?.code, CHECK_VIOLATION_HINT).toBe(CHECK_VIOLATION);
    const negative = await insertItem("importance-neg", { importance: -1 });
    expect(negative.error?.code, CHECK_VIOLATION_HINT).toBe(CHECK_VIOLATION);
  });

  it("INV-H2: 이슈성 칸은 없고 중요도 칸은 있다 — 둘을 같이 본다", async () => {
    // 없는 것만 확인하면 절반이다. 마이그레이션 전에는 **둘 다** 없어서 그 단언이
    // 그냥 통과한다. 있는 쪽을 같이 봐야 "이 마이그레이션이 돌았다"가 증명된다.
    const stored = await db.from("item").select("importance").limit(1);
    expect(stored.error, `중요도를 못 읽는다: ${stored.error?.message}`).toBeNull();

    const derived = await db.from("item").select("issue_score").limit(1);
    expect(derived.error).not.toBeNull();
  });

  it("INV-H2: 물어봤다는 표시 칸이 있다 (중요도 0 과 '못 물어봤다'를 가른다)", async () => {
    const res = await db.from("item").select("hot_issue_at").limit(1);
    expect(res.error, `hot_issue_at 을 못 읽는다: ${res.error?.message}`).toBeNull();
  });
});

describe("0008 적용 확인 — INV-H1 문 배정", () => {
  it("INV-H1: 1번 문 값이 들어간다", async () => {
    const res = await insertItem("gate1", { gate: "gate1", importance: 2 });
    expect(res.error, `gate1 이 거절됐다: ${res.error?.message}`).toBeNull();
  });

  it("INV-H1: 비워 두는 것도 된다 — 판정 못 받은 상태다", async () => {
    const res = await insertItem("gate-null", { gate: null });
    expect(res.error).toBeNull();
  });

  it("INV-H1 실패경로: 아직 안 여는 문은 DB 가 거절한다", async () => {
    // 허용해 두면 그 값이 들어오는데 그릴 화면이 없어서, 그 글은 어디에도 안 나오면서
    // 배정은 받은 상태가 된다.
    const gate2 = await insertItem("gate2", { gate: "gate2" });
    expect(gate2.error?.code, CHECK_VIOLATION_HINT).toBe(CHECK_VIOLATION);
    const typo = await insertItem("gate-typo", { gate: "1번" });
    expect(typo.error?.code, CHECK_VIOLATION_HINT).toBe(CHECK_VIOLATION);
  });
});

describe("0008 적용 확인 — INV-G1 종류는 다대다", () => {
  it("INV-G1: 한 글이 뉴스이면서 툴일 수 있다", async () => {
    const item = await insertItem("kinds-both");
    expect(item.error, `항목 삽입이 실패했다: ${item.error?.message}`).toBeNull();
    const id = item.data?.id as string;

    const res = await db.from("item_kind").insert([
      { item_id: id, kind: "news" },
      { item_id: id, kind: "tool" },
    ]);
    expect(res.error, `둘 다 붙이는 데 실패했다: ${res.error?.message}`).toBeNull();

    const back = await db.from("item_kind").select("kind").eq("item_id", id);
    expect(back.data?.map((r) => r.kind).sort()).toEqual(["news", "tool"]);
  });

  it("INV-G1 실패경로: 값 셋 밖은 DB 가 거절한다", async () => {
    const item = await insertItem("kinds-unknown");
    const id = item.data?.id as string;
    const res = await db.from("item_kind").insert({ item_id: id, kind: "analysis" });
    expect(res.error?.code, CHECK_VIOLATION_HINT).toBe(CHECK_VIOLATION);
  });

  it("INV-G1: 같은 종류를 두 번 붙일 수 없다 (기본키가 막는다)", async () => {
    const item = await insertItem("kinds-dup");
    const id = item.data?.id as string;
    await db.from("item_kind").insert({ item_id: id, kind: "news" });
    const again = await db.from("item_kind").insert({ item_id: id, kind: "news" });
    expect(again.error?.code, "기본키 위반이 아니라 다른 이유로 거절됐다").toBe(UNIQUE_VIOLATION);
  });

  it("INV-G1: 항목을 지우면 종류 연결도 같이 사라진다", async () => {
    const canonicalUrl = `https://example.test/hot-issue/cascade-${Date.now()}`;
    const item = await db
      .from("item")
      .insert({
        canonical_url: canonicalUrl,
        original_url: canonicalUrl,
        title: "연쇄 삭제 확인",
        source_id: "test",
        source_name: "테스트",
        published_at: "2026-09-20T00:00:00.000Z",
      })
      .select("id")
      .single();
    const id = item.data?.id as string;
    await db.from("item_kind").insert({ item_id: id, kind: "news" });

    await db.from("item").delete().eq("id", id);

    const left = await db.from("item_kind").select("kind").eq("item_id", id);
    expect(left.data).toEqual([]);
  });
});
