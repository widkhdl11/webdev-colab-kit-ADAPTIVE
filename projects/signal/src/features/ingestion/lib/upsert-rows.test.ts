import { describe, expect, it } from "vitest";
import type { FeedItemDraft } from "@/entities/article";
import { upsertBatches } from "./upsert-rows";

const NOW = "2026-08-10T00:00:00.000Z";

function draft(over: Partial<FeedItemDraft> = {}): FeedItemDraft {
  return {
    canonicalUrl: "https://ex.com/a",
    originalUrl: "https://ex.com/a?utm_source=rss",
    title: "제목",
    sourceExcerpt: null,
    contentHtml: "",
    sourceId: "hn-frontpage",
    sourceName: "Hacker News",
    publishedAt: "2026-08-09T00:00:00.000Z",
    publishedAtIsFallback: false,
    tags: [],
    officialBasis: "none",
    ...over,
  };
}

describe("upsertBatches", () => {
  it("INV-S5 실패경로: 본문이 빈 항목은 content_html 을 페이로드에 넣지 않는다", () => {
    // 이걸 넣으면 재수집이 **직전 주기에 추출한 본문을 빈 문자열로 덮는다.**
    // 피드는 본문을 안 주는 소스가 대부분이라 매 주기 지워진다.
    const [batch] = upsertBatches([draft({ contentHtml: "" })], NOW);
    expect(batch).toBeDefined();
    expect(Object.keys(batch![0]!)).not.toContain("content_html");
  });

  it("INV-S5: 본문이 있으면 넣는다", () => {
    const [batch] = upsertBatches([draft({ contentHtml: "<p>본문</p>" })], NOW);
    expect(batch![0]!.content_html).toBe("<p>본문</p>");
  });

  it("출처 요약글도 같다 — 없을 때 null 로 덮지 않는다", () => {
    const [batch] = upsertBatches([draft({ sourceExcerpt: null })], NOW);
    expect(Object.keys(batch![0]!)).not.toContain("source_excerpt");
  });

  it("INV-S2 (S19): 출처 요약글이 있으면 넣는다", () => {
    // 부재만 보면 이 줄을 통째로 지워도 통과한다 — 그러면 출처 글이 영영 저장되지 않고
    // AI 요약의 근거(INV-S3)와 화면의 대체 표시(INV-S2)가 동시에 죽는다.
    const [batch] = upsertBatches([draft({ sourceExcerpt: "출처가 준 글" })], NOW);
    expect(batch![0]!.source_excerpt).toBe("출처가 준 글");
  });

  it("항목의 필수 컬럼이 빠지지 않는다 (INV-C2 원본 URL · INV-C5 대체 표시)", () => {
    // 배치 분리 테스트는 "서명이 서로 다르다"만 보므로 컬럼이 빠져도 통과한다.
    // 여기서 서명을 통째로 고정한다.
    const [batch] = upsertBatches([draft()], NOW);
    expect(Object.keys(batch![0]!).sort()).toEqual([
      "canonical_url",
      "original_url",
      "published_at",
      "published_at_is_fallback",
      "source_id",
      "source_name",
      "title",
      "updated_at",
    ]);
  });

  it("INV-S3: summary 는 어떤 경우에도 페이로드에 없다 (재수집이 요약을 덮으면 안 된다)", () => {
    const batches = upsertBatches(
      [draft({ contentHtml: "<p>본문</p>", sourceExcerpt: "글" }), draft()],
      NOW,
    );
    for (const batch of batches) {
      for (const row of batch) {
        expect(Object.keys(row)).not.toContain("summary");
        expect(Object.keys(row)).not.toContain("title_ko");
      }
    }
  });

  it("INV-O2: 주소 근거는 적재할 때마다 다시 싣는다", () => {
    // 주소에서 기계적으로 나오는 값이라 매번 같다 — 다시 실어도 덮어쓸 게 없다.
    const [batch] = upsertBatches([draft({ officialBasis: "byUrl" })], NOW);
    expect(batch![0]!.official_basis).toBe("byUrl");
  });

  it("INV-O2 실패경로: none 은 페이로드에 넣지 않는다 (내용 근거를 지우면 안 된다)", () => {
    // 여기서 "none" 을 실으면 재수집이 **모델이 붙인 byContent 를 매 주기 지운다.**
    // 그 항목은 화면에서 공식 표시가 붙었다 사라졌다 한다.
    const [batch] = upsertBatches([draft({ officialBasis: "none" })], NOW);
    expect(Object.keys(batch![0]!)).not.toContain("official_basis");
  });

  it("컬럼 구성이 다른 항목은 다른 배치로 나뉜다", () => {
    // PostgREST 는 한 upsert 안의 행들이 같은 컬럼 집합이기를 요구한다.
    // 한 배치로 합치면 빠뜨린 컬럼이 null 로 채워져 위 규칙이 무너진다.
    const batches = upsertBatches(
      [draft({ canonicalUrl: "https://ex.com/1", contentHtml: "<p>a</p>" }), draft({ canonicalUrl: "https://ex.com/2" })],
      NOW,
    );
    expect(batches).toHaveLength(2);
    const sigs = batches.map((b) => Object.keys(b[0]!).sort().join(","));
    expect(new Set(sigs).size).toBe(2);
  });

  it("같은 구성끼리는 한 배치로 묶는다 (왕복을 늘리지 않는다)", () => {
    const batches = upsertBatches(
      [draft({ canonicalUrl: "https://ex.com/1" }), draft({ canonicalUrl: "https://ex.com/2" })],
      NOW,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("항목이 없으면 배치도 없다 (빈 upsert 를 부르지 않는다)", () => {
    expect(upsertBatches([], NOW)).toEqual([]);
  });
});
