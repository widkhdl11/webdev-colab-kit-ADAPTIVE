import { describe, expect, it } from "vitest";
import { parseFeedItem } from "./ingest-schema";

/**
 * INV-C3 (ingestion-ranking): 외부 응답은 신뢰 경계 밖이다.
 * 스키마 검증을 통과한 항목만 적재하고, 필수 필드(제목·원문URL) 누락 항목은 버린다.
 */

const FETCHED_AT = new Date("2026-08-09T05:00:00.000Z");
const ok = {
  title: "제목",
  link: "https://ex.com/a?utm_source=rss",
  pubDate: "2026-08-09T09:00:00+09:00",
  summary: "요약",
  contentHtml: "<p>본문</p>",
  tags: ["MCP"],
};

describe("parseFeedItem — INV-C3 외부 응답 경계", () => {
  it("INV-C3: 통과한 항목은 정규화된 값으로 나온다", () => {
    const item = parseFeedItem(ok, { fetchedAt: FETCHED_AT, sourceId: "s", sourceName: "S", subjectSites: [] });
    expect(item).not.toBeNull();
    // 여기서 나오는 값이 그대로 적재된다 — 경계에서 한 번만 검증한다는 규칙(domain-layers).
    expect(item?.canonicalUrl).toBe("https://ex.com/a"); // INV-C2 를 통과한 값
    expect(item?.originalUrl).toBe("https://ex.com/a?utm_source=rss"); // 원본도 보존
    expect(item?.publishedAt).toBe("2026-08-09T00:00:00.000Z"); // INV-C5 UTC
    expect(item?.publishedAtIsFallback).toBe(false);
    expect(item?.sourceId).toBe("s");
  });

  it("INV-C3: 발행시각이 없어도 버리지 않고 대체한다 (INV-C5 와 맞춘 자리)", () => {
    // 2026-08-09 정정 전에는 발행시각이 필수 목록에 있어 여기서 버려졌다.
    // 그러면 INV-C5 의 "대체 여부를 구분해 남긴다"가 닿지 않는 분기가 된다.
    const item = parseFeedItem({ ...ok, pubDate: undefined }, {
      fetchedAt: FETCHED_AT,
      sourceId: "s",
      sourceName: "S",
      subjectSites: [],
    });
    expect(item).not.toBeNull();
    expect(item?.publishedAt).toBe(FETCHED_AT.toISOString());
    expect(item?.publishedAtIsFallback).toBe(true);
  });

  it("INV-C3: 모르는 태그는 조용히 버리고 아는 것만 남긴다", () => {
    const item = parseFeedItem({ ...ok, tags: ["MCP", "없는태그", 7] }, {
      fetchedAt: FETCHED_AT,
      sourceId: "s",
      sourceName: "S",
      subjectSites: [],
    });
    // 태그는 필수가 아니다 — 하나가 이상하다고 기사를 통째로 버리면 피드가 빈다.
    expect(item?.tags).toEqual(["MCP"]);
  });

  it("INV-C3: 요약글·본문이 없으면 빈 값으로 (필수가 아니다)", () => {
    const item = parseFeedItem(
      { title: "제목", link: "https://ex.com/a", pubDate: ok.pubDate },
      { fetchedAt: FETCHED_AT, sourceId: "s", sourceName: "S", subjectSites: [] },
    );
    // 요약글은 "없음"을 null 로 표현한다 — 빈 문자열이면 "있는데 비었다"와 구별이 안 되고,
    // INV-S3 의 "근거가 있나" 판정이 흐려진다.
    expect(item?.sourceExcerpt).toBeNull();
    expect(item?.contentHtml).toBe("");
  });

  it("INV-S2: 출처 요약글을 정리해 싣는다", () => {
    const item = parseFeedItem(
      { ...ok, summary: "<p>OpenAI 가 새 평가 결과를 공개했다.</p>" },
      { fetchedAt: FETCHED_AT, sourceId: "s", sourceName: "S", subjectSites: [] },
    );
    expect(item?.sourceExcerpt).toBe("OpenAI 가 새 평가 결과를 공개했다.");
  });

  it("INV-S3 실패경로: 링크뿐인 요약글은 근거로 싣지 않는다", () => {
    const item = parseFeedItem(
      {
        ...ok,
        summary:
          '<p>Article URL: <a href="https://ex.com/x">https://ex.com/x</a></p>' +
          '<p>Comments URL: <a href="https://news.ycombinator.com/item?id=1">c</a></p>',
      },
      { fetchedAt: FETCHED_AT, sourceId: "s", sourceName: "S", subjectSites: [] },
    );
    expect(item?.sourceExcerpt).toBeNull();
  });

  it("INV-O1 (CS6): 출처는 수집 소스 이름이 아니라 원문 주소의 발행처다", () => {
    const item = parseFeedItem(
      { ...ok, link: "https://techcrunch.com/2026/08/09/x" },
      { fetchedAt: FETCHED_AT, sourceId: "hn-frontpage", sourceName: "Hacker News", subjectSites: [] },
    );
    expect(item?.sourceName).toBe("Techcrunch");
  });

  it("INV-O1 (CS7) 실패경로: 발행처를 못 뽑으면 수집 소스 이름으로 되돌아간다", () => {
    const item = parseFeedItem(
      { ...ok, link: "http://localhost/x" },
      { fetchedAt: FETCHED_AT, sourceId: "hn-frontpage", sourceName: "Hacker News", subjectSites: [] },
    );
    expect(item?.sourceName).toBe("Hacker News");
  });

  it("INV-O2·O3 (CS10): 원문 주소가 주체 도메인이면 byUrl 로 적재된다", () => {
    const item = parseFeedItem(
      { ...ok, link: "https://www.anthropic.com/news/x" },
      {
        fetchedAt: FETCHED_AT,
        sourceId: "hn-frontpage",
        sourceName: "Hacker News",
        subjectSites: [{ host: "anthropic.com", pathPrefix: "/news/" }],
      },
    );
    expect(item?.officialBasis).toBe("byUrl");
  });

  it("INV-O2 (CS9) 실패경로: 주체 도메인이 아니면 none 이다 (모델이 나중에 정한다)", () => {
    const item = parseFeedItem(
      { ...ok, link: "https://techcrunch.com/2026/08/09/x" },
      {
        fetchedAt: FETCHED_AT,
        sourceId: "hn-frontpage",
        sourceName: "Hacker News",
        subjectSites: [{ host: "anthropic.com", pathPrefix: "/news/" }],
      },
    );
    expect(item?.officialBasis).toBe("none");
  });

  it("INV-T3: 제목 키워드로 태그가 미리 붙는다", () => {
    const item = parseFeedItem(
      { ...ok, title: "Real-time MCP interceptor", tags: [] },
      { fetchedAt: FETCHED_AT, sourceId: "s", sourceName: "S", subjectSites: [] },
    );
    expect(item?.tags).toContain("MCP");
  });

  describe("실패 경로 — 버린다", () => {
    const parse = (raw: unknown) =>
      parseFeedItem(raw, { fetchedAt: FETCHED_AT, sourceId: "s", sourceName: "S", subjectSites: [] });

    it("INV-C3 (S3) 실패경로: 제목이 없으면 버린다", () => {
      expect(parse({ ...ok, title: undefined })).toBeNull();
      expect(parse({ ...ok, title: "" })).toBeNull();
      expect(parse({ ...ok, title: "   " })).toBeNull();
    });

    it("INV-C3 (S3) 실패경로: 원문 URL 이 없으면 버린다", () => {
      expect(parse({ ...ok, link: undefined })).toBeNull();
      expect(parse({ ...ok, link: "" })).toBeNull();
    });

    it("INV-C3 실패경로: 정규화가 실패하는 URL 은 버린다", () => {
      // 유일성 키를 만들 수 없으면 INV-C1 의 중복 판정 자체가 불가능하다.
      expect(parse({ ...ok, link: "javascript:alert(1)" })).toBeNull();
      expect(parse({ ...ok, link: "이건 URL 이 아니다" })).toBeNull();
    });

    it("INV-C3 실패경로: 타입이 어긋나면 버린다", () => {
      expect(parse({ ...ok, title: 7 })).toBeNull();
      expect(parse({ ...ok, link: { href: "https://ex.com" } })).toBeNull();
      expect(parse(null)).toBeNull();
      expect(parse(undefined)).toBeNull();
      expect(parse("문자열")).toBeNull();
      expect(parse([])).toBeNull();
    });

    it("INV-C3 실패경로: 던지지 않는다 — 한 항목이 수집 전체를 죽이면 안 된다", () => {
      expect(() => parse(Object.create(null))).not.toThrow();
      expect(() => parse({ title: "제목", link: "https://ex.com/a", tags: "MCP" })).not.toThrow();
    });
  });
});
