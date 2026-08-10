import { describe, expect, it } from "vitest";
import { toListItemRow, toStoredArticle } from "./row";

/**
 * 조회 응답은 신뢰 경계 밖이다 (rules/supabase: "반환값을 그대로 도메인에 넘기지 말고
 * 경계에서 파싱·검증한다"). 여기서 통과한 것만 도메인·화면으로 간다.
 *
 * 왜 검증하나: DB 스키마와 코드가 어긋나는 순간(마이그레이션을 빼먹거나 컬럼 이름이 바뀌면)
 * 화면은 `undefined` 를 렌더하고, 증상은 "제목이 빈 카드"처럼 원인과 먼 곳에서 나타난다.
 */

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  canonical_url: "https://ex.com/a",
  original_url: "https://ex.com/a?utm_source=rss",
  title: "English title",
  title_ko: "한국어 제목",
  summary: "요약",
  summary_points: ["항목1", "항목2"],
  content_html: "<p>본문</p>",
  source_id: "anthropic-news",
  source_name: "Anthropic",
  published_at: "2026-08-09T00:00:00+00:00",
  published_at_is_fallback: false,
  item_tag: [{ tag: { name: "MCP" } }, { tag: { name: "모델" } }],
};

describe("toStoredArticle — 조회 경계", () => {
  it("행을 도메인 모양으로 옮긴다", () => {
    const a = toStoredArticle(row);
    expect(a).not.toBeNull();
    expect(a?.id).toBe(row.id);
    expect(a?.title).toBe("English title");
    expect(a?.sourceId).toBe("anthropic-news");
    expect(a?.contentHtml).toBe("<p>본문</p>");
    expect(a?.tags).toEqual(["MCP", "모델"]);
  });

  it("원문 링크는 정규화 이전 주소를 쓴다", () => {
    // canonical_url 은 유일성 키지 사람이 여는 주소가 아니다.
    // 추적 파라미터를 지운 주소가 출처에서 404 인 경우가 있다(INV-C2).
    expect(toStoredArticle(row)?.sourceUrl).toBe("https://ex.com/a?utm_source=rss");
  });

  it("INV-C5: 발행시각을 UTC ISO 로 맞춘다", () => {
    // Postgres 는 `+00:00` 꼴로 돌려준다. 화면·정렬이 쓰는 표기와 다르면 비교가 어긋난다.
    expect(toStoredArticle(row)?.publishedAt).toBe("2026-08-09T00:00:00.000Z");
  });

  it("요약이 null 이면 빈 문자열로 (INV-S2: 요약 없는 항목이 정상이다)", () => {
    const a = toStoredArticle({ ...row, summary: null, summary_points: null });
    expect(a?.summary).toBe("");
    expect(a?.summaryPoints).toEqual([]);
  });

  it("모르는 태그는 버리고 아는 것만 남긴다", () => {
    const a = toStoredArticle({
      ...row,
      item_tag: [{ tag: { name: "MCP" } }, { tag: { name: "없는태그" } }, { tag: null }],
    });
    expect(a?.tags).toEqual(["MCP"]);
  });

  it("태그 조인이 통째로 없어도 항목은 살아 있다", () => {
    const { item_tag: _omit, ...withoutTags } = row;
    expect(toStoredArticle(withoutTags)?.tags).toEqual([]);
  });

  describe("실패 경로 — 못 믿을 행은 버린다", () => {
    it("필수 컬럼이 없으면 null (화면에 빈 카드를 만들지 않는다)", () => {
      for (const key of ["id", "title", "original_url", "source_id", "published_at"]) {
        expect(toStoredArticle({ ...row, [key]: null }), key).toBeNull();
        expect(toStoredArticle({ ...row, [key]: undefined }), key).toBeNull();
      }
    });

    it("타입이 어긋나면 null", () => {
      expect(toStoredArticle({ ...row, title: 7 })).toBeNull();
      expect(toStoredArticle(null)).toBeNull();
      expect(toStoredArticle("문자열")).toBeNull();
    });

    it("발행시각을 못 읽으면 null", () => {
      // 여기를 통과시키면 dayKey 가 빈 문자열이 되어 항목이 날짜 묶음에서 조용히 사라진다.
      expect(toStoredArticle({ ...row, published_at: "어제쯤" })).toBeNull();
    });

    it("던지지 않는다 — 행 하나가 목록 전체를 죽이면 안 된다", () => {
      expect(() => toStoredArticle({ item_tag: "이상함" })).not.toThrow();
    });
  });
});

describe("toListItemRow — 목록 투영", () => {
  it("본문을 담지 않는다 (목록 쿼리는 content_html 을 안 뽑는다)", () => {
    const { content_html: _omit, ...listRow } = row;
    const a = toListItemRow(listRow);
    expect(a).not.toBeNull();
    expect("contentHtml" in (a as object)).toBe(false);
    expect(a?.title).toBe("English title");
  });

  it("본문이 섞여 와도 목록 모양에는 안 싣는다", () => {
    // 쿼리에서 컬럼을 실수로 넣어도 클라이언트로 새어 나가지 않게 한 겹 더 막는다.
    const a = toListItemRow(row);
    expect("contentHtml" in (a as object)).toBe(false);
  });
});

describe("toStoredArticle — 제목 (INV-S6 / S23)", () => {
  it("title_ko 를 도메인으로 옮긴다 — 원문 title 은 그대로 둔다", () => {
    // 이 매핑이 없으면 번역을 다 만들어 놓고도 화면은 전부 영어다.
    // 다른 테스트들은 도메인 객체를 손으로 만들어 쓰므로 이 경로를 지나지 않는다.
    const a = toStoredArticle(row);
    expect(a?.titleKo).toBe("한국어 제목");
    expect(a?.title).toBe("English title");
  });

  it("title_ko 가 없는 행은 null 로 온다 (화면이 원문으로 폴백한다)", () => {
    const a = toStoredArticle({ ...row, title_ko: null });
    expect(a?.titleKo).toBeNull();
    const b = toStoredArticle({ ...row, title_ko: undefined });
    expect(b?.titleKo).toBeNull();
  });

  it("목록 투영에도 title_ko 가 실린다 (피드 카드가 쓴다)", () => {
    expect(toListItemRow(row)?.titleKo).toBe("한국어 제목");
  });
});

describe("조회 컬럼 목록 — 빠지면 조용히 null 이 된다", () => {
  it("INV-S6 (S23): 목록 select 에 title_ko 가 있다", async () => {
    const { LIST_COLUMNS } = await import("./queries");
    expect(LIST_COLUMNS).toContain("title_ko");
    // 목록은 본문을 실어 나르지 않는다 (직렬화 비용).
    expect(LIST_COLUMNS).not.toContain("content_html");
  });
});
