import { describe, expect, it } from "vitest";
import type { ArticleListItem, ArticleTag } from "../model/types";
import {
  filterByTag,
  findArticleById,
  groupByDay,
  selectFeed,
  sortArticles,
} from "./query";

function article(
  id: string,
  publishedAt: string,
  score: number,
  tags: ArticleTag[] = ["모델"],
): ArticleListItem {
  // 목록 경로가 다루는 것은 본문 없는 투영이다 — contentHtml 을 넣으면 대입 자체가 막힌다
  return {
    id,
    title: id,
    titleKo: null,
    summary: "",
    sourceExcerpt: null,
    summaryPoints: [],
    sourceId: "test-source",
    sourceName: "테스트",
    sourceUrl: "https://example.com",
    publishedAt,
    tags,
    officialBasis: "none",
    score,
    isTrending: false,
  };
}

// KST 기준으로 8월 5일 2건, 8월 4일 2건.
const TODAY_HIGH = article("today-high", "2026-08-05T00:00:00.000Z", 90);
const TODAY_LOW = article("today-low", "2026-08-05T02:00:00.000Z", 10);
const PREV_HIGH = article("prev-high", "2026-08-04T00:00:00.000Z", 95);
const PREV_LOW = article("prev-low", "2026-08-04T02:00:00.000Z", 20);
const ALL = [TODAY_LOW, PREV_HIGH, TODAY_HIGH, PREV_LOW];

describe("findArticleById", () => {
  it("id 로 찾는다", () => {
    expect(findArticleById(ALL, "prev-high")).toBe(PREV_HIGH);
  });

  it("없는 id 는 undefined — 화면이 404 로 갈 수 있어야 한다", () => {
    expect(findArticleById(ALL, "없는-id")).toBeUndefined();
  });
});

describe("filterByTag", () => {
  it("태그가 null 이면 전부 통과시킨다", () => {
    expect(filterByTag(ALL, null)).toHaveLength(4);
  });

  it("태그를 여러 개 단 항목도 그중 하나만 맞으면 통과한다", () => {
    const multi = article("multi", "2026-08-05T00:00:00.000Z", 1, [
      "MCP",
      "툴",
    ]);
    expect(filterByTag([multi], "툴")).toEqual([multi]);
    expect(filterByTag([multi], "모델")).toEqual([]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const source = [...ALL];
    filterByTag(source, "모델");
    expect(source).toEqual(ALL);
  });
});

describe("sortArticles", () => {
  it("뜨는순은 점수가 높은 것부터", () => {
    expect(sortArticles(ALL, "trending").map((a) => a.id)).toEqual([
      "prev-high",
      "today-high",
      "prev-low",
      "today-low",
    ]);
  });

  it("최신순은 발행이 늦은 것부터", () => {
    expect(sortArticles(ALL, "latest").map((a) => a.id)).toEqual([
      "today-low",
      "today-high",
      "prev-low",
      "prev-high",
    ]);
  });

  it("점수가 같으면 최신이 먼저 — 순서가 흔들리지 않게", () => {
    const older = article("older", "2026-08-05T00:00:00.000Z", 50);
    const newer = article("newer", "2026-08-05T03:00:00.000Z", 50);
    expect(sortArticles([older, newer], "trending").map((a) => a.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("groupByDay", () => {
  it("KST 달력 날짜로 묶고 최신 날짜부터 내보낸다", () => {
    const groups = groupByDay(ALL);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-08-05", "2026-08-04"]);
  });

  it("그룹 안 순서는 받은 그대로 둔다 (정렬은 2차)", () => {
    const groups = groupByDay(sortArticles(ALL, "trending"));
    expect(groups[0].articles.map((a) => a.id)).toEqual([
      "today-high",
      "today-low",
    ]);
    expect(groups[1].articles.map((a) => a.id)).toEqual([
      "prev-high",
      "prev-low",
    ]);
  });
});

describe("selectFeed", () => {
  it("점수가 날짜를 가로지르지 않는다 — 날짜가 1차, 정렬이 2차", () => {
    // prev-high(95)가 전체 최고점이지만 오늘 그룹보다 먼저 나올 수 없다.
    const { groups } = selectFeed({
      articles: ALL,
      tag: null,
      sort: "trending",
      limit: 10,
    });
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-08-05", "2026-08-04"]);
    expect(groups[0].articles[0].id).toBe("today-high");
  });

  it("개수 제한은 앞에서부터 자른다 — 오늘이 먼저 다 보인다", () => {
    const { groups, shown, total } = selectFeed({
      articles: ALL,
      tag: null,
      sort: "trending",
      limit: 3,
    });
    expect(shown).toBe(3);
    expect(total).toBe(4);
    expect(groups.map((g) => g.articles.map((a) => a.id))).toEqual([
      ["today-high", "today-low"],
      ["prev-high"],
    ]);
  });

  it("total 은 제한이 아니라 필터 기준이다 (더 볼 것이 남았는지 판단용)", () => {
    const tagged = [
      article("a", "2026-08-05T00:00:00.000Z", 1, ["MCP"]),
      article("b", "2026-08-05T01:00:00.000Z", 2, ["툴"]),
    ];
    const { shown, total } = selectFeed({
      articles: tagged,
      tag: "MCP",
      sort: "latest",
      limit: 10,
    });
    expect(shown).toBe(1);
    expect(total).toBe(1);
  });

  it("limit 0 이면 아무것도 그리지 않지만 total 은 남는다", () => {
    const { groups, shown, total } = selectFeed({
      articles: ALL,
      tag: null,
      sort: "latest",
      limit: 0,
    });
    expect(groups).toEqual([]);
    expect(shown).toBe(0);
    expect(total).toBe(4);
  });
});

// 발행시각을 못 읽는 항목 — 수집 경계(INV-C5)가 막아주는 값이지만, 약속이 깨졌을 때
// 목록 전체가 죽지 않아야 한다. 이 동작이 없으면 "NaN월 NaN일 (undefined)" 헤더가 그려진다.
describe("발행시각을 못 읽는 항목", () => {
  const BROKEN = article("broken", "이건 날짜가 아니다", 50);

  it("날짜 묶음에서 빠진다 — 한 건이 목록 전체를 죽이지 않는다", () => {
    const groups = groupByDay([...ALL, BROKEN]);
    expect(groups.map((g) => g.dayKey)).not.toContain("");
    expect(groups.flatMap((g) => g.articles).map((a) => a.id)).not.toContain(
      "broken",
    );
    expect(groups.flatMap((g) => g.articles)).toHaveLength(ALL.length);
  });

  it("total 도 함께 줄어든다 — 안 그리면 '더 보기'가 눌러도 안 끝난다", () => {
    const { shown, total } = selectFeed({
      articles: [...ALL, BROKEN],
      tag: null,
      sort: "latest",
      limit: 100,
    });
    // 그릴 수 없는 항목이 total 에 남으면 shown < total 이 영원히 참이 된다
    expect(total).toBe(ALL.length);
    expect(shown).toBe(total);
  });
});
