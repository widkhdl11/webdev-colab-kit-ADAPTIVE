import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DB 가 실제로 제약을 거는지 — INV-C1 · R1 · T1 · T2.
 *
 * `tests/schema-contract.test.ts` 는 SQL 텍스트가 스펙대로 생겼는지만 본다. 여기서는
 * **살아 있는 DB 에 넣어 보고 거절당하는지**를 본다. 둘 다 필요하다 — 텍스트만 보면
 * 마이그레이션을 적용 안 한 상태를 못 잡고, DB 만 보면 왜 그렇게 생겼는지가 안 남는다.
 *
 * 실행: `npm run test:integration` (SUPABASE_SECRET_KEY 필요 — RLS 를 우회해 쓰기까지 한다).
 * 환경변수가 없으면 **건너뛰지 않고 실패한다.** 조용히 건너뛰면 "통과했다"로 읽힌다.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

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

const item = (canonicalUrl: string) => {
  created.push(canonicalUrl);
  return {
    canonical_url: canonicalUrl,
    original_url: `${canonicalUrl}?utm_source=rss`,
    title: "통합 테스트 항목",
    source_id: "test",
    source_name: "테스트",
    published_at: "2026-08-09T00:00:00.000Z",
  };
};

describe("INV-C1 — canonical_url 유일성은 DB 가 건다", () => {
  it("INV-C1 (S1): 같은 canonical_url 을 두 번 넣으면 두 번째는 거절된다", async () => {
    const row = item("https://ex.com/integration-c1");
    const first = await db.from("item").insert(row);
    expect(first.error).toBeNull();

    const second = await db.from("item").insert(row);
    // 23505 = unique_violation. 애플리케이션이 아니라 DB 가 막았다는 증거다.
    expect(second.error?.code).toBe("23505");
  });

  it("INV-C1 (S1): upsert 는 새 행을 만들지 않고 기존 행을 갱신한다", async () => {
    const row = item("https://ex.com/integration-c1-upsert");
    await db.from("item").insert(row);

    const up = await db
      .from("item")
      .upsert({ ...row, title: "갱신된 제목" }, { onConflict: "canonical_url" });
    expect(up.error).toBeNull();

    const { data } = await db
      .from("item")
      .select("title")
      .eq("canonical_url", row.canonical_url);
    expect(data).toHaveLength(1);
    expect(data?.[0].title).toBe("갱신된 제목");
  });
});

describe("INV-R1 — 점수 컬럼이 DB 에 없다", () => {
  it("INV-R1 (S6): score 컬럼을 고르면 에러가 난다", async () => {
    const { error } = await db.from("item").select("score").limit(1);
    expect(error).not.toBeNull();
  });

  it("INV-R1: is_trending 컬럼도 없다", async () => {
    const { error } = await db.from("item").select("is_trending").limit(1);
    expect(error).not.toBeNull();
  });
});

describe("INV-T1·T2 — 태그", () => {
  it("INV-T2 (S15): 정규화된 태그명은 중복될 수 없다", async () => {
    const normalized = `mcp-integration-${Date.now()}`;
    const first = await db.from("tag").insert({ name: "MCP", normalized_name: normalized });
    expect(first.error).toBeNull();

    const second = await db.from("tag").insert({ name: "mcp", normalized_name: normalized });
    expect(second.error?.code).toBe("23505");

    await db.from("tag").delete().eq("normalized_name", normalized);
  });

  it("INV-T1 (S14): 항목 하나에 태그 여러 개가 붙는다", async () => {
    const row = item("https://ex.com/integration-t1");
    const { data: inserted } = await db.from("item").insert(row).select("id").single();
    const itemId = inserted!.id as string;

    const names = ["t1-a", "t1-b", "t1-c"].map((n) => `${n}-${Date.now()}`);
    const { data: tags } = await db
      .from("tag")
      .insert(names.map((n) => ({ name: n, normalized_name: n })))
      .select("id");

    const { error } = await db
      .from("item_tag")
      .insert(tags!.map((t) => ({ item_id: itemId, tag_id: t.id })));
    expect(error).toBeNull();

    const { data: joined } = await db
      .from("item_tag")
      .select("tag_id")
      .eq("item_id", itemId);
    expect(joined).toHaveLength(3);

    await db.from("tag").delete().in("normalized_name", names);
  });
});

describe("publishable 키는 남의 행을 못 고치고 못 지운다", () => {
  /**
   * RLS 는 delete·update 를 **거절하지 않는다.** 정책이 없으면 그 행이 안 보일 뿐이라
   * 0행이 처리되고 성공으로 끝난다 — 그래서 "에러가 났나"로 확인하면 통과해 버린다
   * (2026-08-09 에 실제로 그렇게 잘못 썼다).
   *
   * 그리고 행을 안 심어 두면 "0행 지워짐"은 아무것도 증명하지 않는다. 심어 놓고 **살아남는지**를 본다.
   */
  const publishable = () => {
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요하다.");
    return createClient(url!, key, { auth: { persistSession: false } });
  };

  it("delete 를 보내도 행이 남아 있다", async () => {
    const row = item("https://ex.com/integration-rls-delete");
    const seeded = await db.from("item").insert(row);
    expect(seeded.error, "심는 것부터 실패하면 아래 확인이 무의미하다").toBeNull();

    await publishable().from("item").delete().eq("canonical_url", row.canonical_url);

    const { data } = await db
      .from("item")
      .select("id")
      .eq("canonical_url", row.canonical_url);
    expect(data, "publishable 키로 남의 행이 지워졌다").toHaveLength(1);
  });

  it("update 를 보내도 값이 안 바뀐다", async () => {
    const row = item("https://ex.com/integration-rls-update");
    await db.from("item").insert(row);

    await publishable()
      .from("item")
      .update({ title: "고쳐졌다" })
      .eq("canonical_url", row.canonical_url);

    const { data } = await db
      .from("item")
      .select("title")
      .eq("canonical_url", row.canonical_url);
    expect(data?.[0].title).toBe(row.title);
  });
});
