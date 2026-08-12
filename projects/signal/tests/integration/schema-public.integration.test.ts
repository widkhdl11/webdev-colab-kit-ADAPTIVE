import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * publishable 키만으로 확인할 수 있는 것 — 스키마가 실제로 올라갔는지, 점수 컬럼이 없는지,
 * 그리고 **공개 키로는 못 쓴다**는 것.
 *
 * secret 키가 필요한 것(unique 제약이 정말 거절하는지 — INV-C1·T1·T2)은
 * schema.integration.test.ts 에 따로 있다.
 *
 * 환경변수가 없으면 건너뛰지 않고 실패한다. 조용히 건너뛰면 "통과했다"로 읽힌다.
 */

let anon: SupabaseClient;

beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요하다. " +
        "`npm run check:env` 로 이름을 확인하세요.",
    );
  }
  anon = createClient(url, key, { auth: { persistSession: false } });
});

describe("스키마가 실제로 올라갔는지", () => {
  it("item · tag · item_tag 세 테이블이 있다", async () => {
    for (const table of ["item", "tag", "item_tag"]) {
      const { error } = await anon.from(table).select("*").limit(1);
      expect(error, `${table}: ${error?.message ?? ""}`).toBeNull();
    }
  });

  it("INV-C5: 발행시각·대체 여부 컬럼이 있다", async () => {
    const { error } = await anon
      .from("item")
      .select("published_at, published_at_is_fallback, fetched_at")
      .limit(1);
    expect(error).toBeNull();
  });

  it("INV-C2: 정규화 URL 과 원본 URL 이 둘 다 있다", async () => {
    const { error } = await anon.from("item").select("canonical_url, original_url").limit(1);
    expect(error).toBeNull();
  });
});

describe("INV-O2 — 공식 여부의 근거", () => {
  it("INV-O2: official_basis 컬럼이 실제로 올라가 있다", async () => {
    // SQL 텍스트 검사(schema-contract)는 파일만 본다 — 마이그레이션을 안 돌렸으면 그쪽은
    // 통과하는데 화면은 조회에서 죽는다. 그 간극을 여기서 잡는다.
    const { error } = await anon.from("item").select("official_basis").limit(1);
    expect(error, error?.message).toBeNull();
  });

  it("INV-O2: 기존 항목의 기본값은 none 이다", async () => {
    const { data, error } = await anon.from("item").select("official_basis").limit(50);
    expect(error).toBeNull();
    // null 이 섞여 있으면 기본값 없이 컬럼만 추가된 것이다.
    expect((data ?? []).every((r) => r.official_basis !== null)).toBe(true);
    for (const r of data ?? []) {
      expect(["none", "byUrl", "byContent"]).toContain(r.official_basis);
    }
  });
});

describe("INV-R1 — 점수는 DB 에 없다", () => {
  it("INV-R1 (S6): score 컬럼을 고르면 에러가 난다", async () => {
    const { error } = await anon.from("item").select("score").limit(1);
    expect(error).not.toBeNull();
  });

  it("INV-R1: is_trending 컬럼도 없다", async () => {
    const { error } = await anon.from("item").select("is_trending").limit(1);
    expect(error).not.toBeNull();
  });
});

describe("쓰기는 열려 있지 않다 (INV-S4 인접)", () => {
  /**
   * "에러가 났다"로는 부족하다 — 키가 틀려도 에러가 난다.
   *
   * 처음엔 `expect(error).not.toBeNull()` 만 뒀는데, 키가 `Invalid API key` 로 거절당하는
   * 상황에서도 그대로 통과했다. **막힌 이유가 인가인지 인증 실패인지 갈라야** 검증이 된다.
   */
  const expectBlockedByRls = (error: { code?: string; message: string } | null) => {
    expect(error, "쓰기가 통과했다 — 누구나 쓸 수 있다는 뜻이다").not.toBeNull();
    expect(error!.message, "키 자체가 거절당했다 — RLS 를 확인한 게 아니다").not.toMatch(
      /Invalid API key/i,
    );
    // 42501 = insufficient_privilege. RLS 정책이 없어서 막힌 경우다.
    expect(error!.code).toBe("42501");
  };

  it("publishable 키로 insert 하면 RLS 가 막는다", async () => {
    const { error } = await anon.from("item").insert({
      canonical_url: `https://ex.com/rls-probe-${Math.random().toString(36).slice(2)}`,
      original_url: "https://ex.com/rls-probe",
      title: "RLS 확인용",
      source_id: "test",
      source_name: "테스트",
      published_at: "2026-08-09T00:00:00.000Z",
    });
    expectBlockedByRls(error);
  });

  // delete·update 는 여기서 안 본다. RLS 는 그 둘을 **거절하지 않는다** — 정책이 없으면
  // 행이 아예 안 보여서 0행이 처리되고 성공으로 끝난다. 그래서 "에러가 났나"로는 못 잡고,
  // **행을 심어 놓고 그게 살아남는지**를 봐야 한다. 그건 secret 키가 필요해서
  // schema.integration.test.ts 에 있다.
});
