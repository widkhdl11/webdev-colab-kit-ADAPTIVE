import { describe, expect, it } from "vitest";
import { selectFeed, toListItem } from "@/entities/article";
import type { StoredArticle } from "@/entities/article";
import { sourceWeightLookup } from "@/entities/source";
import { rankFeed } from "./rank-feed";

/**
 * 조회 시점에 점수를 만들고(INV-R1), weight 는 설정에서 읽고(INV-R4),
 * '뜨는 중'은 필터를 걸기 전에 정한다(INV-R5).
 */

const NOW = new Date("2026-08-09T12:00:00.000Z");

const SOURCES = [
  { id: "hi", name: "높은 곳", weight: 2, feedUrl: "https://ex.com/hi.xml", tier: "daily" as const },
  { id: "lo", name: "낮은 곳", weight: 1, feedUrl: "https://ex.com/lo.xml", tier: "daily" as const },
];
const weightOf = sourceWeightLookup(SOURCES);

/** KST 기준 같은 날(2026-08-09)에 들어온 항목들. */
function stored(
  id: string,
  sourceId: string,
  hoursAgo: number,
  tags: StoredArticle["tags"] = ["MCP"],
): StoredArticle {
  return {
    id,
    title: `제목 ${id}`,
    titleKo: null,
    summary: "",
    sourceExcerpt: null,
    summaryPoints: [],
    contentHtml: "<p>본문</p>",
    sourceId,
    sourceName: sourceId,
    sourceUrl: `https://ex.com/${id}`,
    publishedAt: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(),
    tags,
    officialBasis: "none",
  };
}

describe("rankFeed — INV-R1 점수는 조회 시점 파생값", () => {
  it("INV-R1: 저장 모양에는 점수가 없고, 조회 결과에는 있다", () => {
    const input = [stored("a", "hi", 1)];
    // 저장 모양에 점수 필드가 아예 없다는 것 자체가 이 불변식의 내용이다.
    expect("score" in input[0]).toBe(false);
    expect("isTrending" in input[0]).toBe(false);

    const out = rankFeed({ items: input, now: NOW, weightOf });
    expect(typeof out[0].score).toBe("number");
    expect(typeof out[0].isTrending).toBe("boolean");
  });

  it("INV-R1: 같은 항목이라도 조회 시각이 늦으면 점수가 낮다 (저장값이 아니다)", () => {
    const input = [stored("a", "hi", 1)];
    const early = rankFeed({ items: input, now: NOW, weightOf })[0].score;
    const later = rankFeed({
      items: input,
      now: new Date(NOW.getTime() + 24 * 3600_000),
      weightOf,
    })[0].score;
    expect(later).toBeLessThan(early);
  });

  it("INV-R1: 입력 항목을 건드리지 않는다 (점수를 되써넣지 않는다)", () => {
    const input = [stored("a", "hi", 1)];
    const before = JSON.stringify(input);
    rankFeed({ items: input, now: NOW, weightOf });
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("rankFeed — INV-R4 weight 는 소스에서 조회 시점에 읽는다", () => {
  it("INV-R4 (S7): 발행시각이 같으면 weight 높은 소스가 점수가 높다", () => {
    const out = rankFeed({
      items: [stored("low", "lo", 3), stored("high", "hi", 3)],
      now: NOW,
      weightOf,
    });
    const score = (id: string) => out.find((a) => a.id === id)!.score;
    expect(score("high")).toBeGreaterThan(score("low"));
    expect(score("high")).toBeCloseTo(score("low") * 2, 10);
  });

  it("INV-R4 (S9): 설정의 weight 를 올리면 항목을 안 건드려도 순위가 오른다", () => {
    const items = [stored("low", "lo", 3), stored("high", "hi", 3)];
    const before = rankFeed({ items, now: NOW, weightOf }).sort(
      (a, b) => b.score - a.score,
    );
    expect(before[0].id).toBe("high");

    // 재수집도, 배치도 없이 설정만 바꾼다.
    const boosted = sourceWeightLookup(
      SOURCES.map((s) => (s.id === "lo" ? { ...s, weight: 10 } : s)),
    );
    const after = rankFeed({ items, now: NOW, weightOf: boosted }).sort(
      (a, b) => b.score - a.score,
    );
    expect(after[0].id).toBe("low");
  });

  it("INV-R4 실패경로: 항목에 weight 를 스냅샷으로 남기지 않는다", () => {
    const out = rankFeed({ items: [stored("a", "hi", 1)], now: NOW, weightOf });
    expect(Object.keys(out[0])).not.toContain("weight");
    expect(Object.keys(out[0])).not.toContain("sourceWeight");
  });
});

describe("rankFeed + selectFeed — INV-R5 뱃지는 필터 전 기준", () => {
  // 같은 날짜 그룹 6건. 점수 상위 3 = A·B·C (weight 높은 소스 + 최신).
  const items = [
    stored("A", "hi", 1, ["모델"]),
    stored("B", "hi", 2, ["모델"]),
    stored("C", "hi", 3, ["모델"]),
    stored("D", "lo", 4, ["MCP"]),
    stored("E", "lo", 5, ["MCP"]),
    stored("F", "lo", 6, ["MCP"]),
  ];

  it("INV-R5 (S16): 필터 없이 조회하면 상위 3 개만 뜨는 중이고, 정렬을 바꿔도 그대로다", () => {
    const ranked = rankFeed({ items, now: NOW, weightOf });
    const trending = (sort: "trending" | "latest") =>
      selectFeed({ articles: ranked.map(toListItem), tag: null, sort, limit: 100 })
        .groups.flatMap((g) => g.articles)
        .filter((a) => a.isTrending)
        .map((a) => a.id)
        .sort();

    expect(trending("trending")).toEqual(["A", "B", "C"]);
    expect(trending("latest")).toEqual(["A", "B", "C"]);
  });

  it("INV-R5 (S17) 실패경로: 상위 3 개가 없는 태그로 거르면 뱃지가 0 개다", () => {
    const ranked = rankFeed({ items, now: NOW, weightOf });
    const shown = selectFeed({
      articles: ranked.map(toListItem),
      tag: "MCP",
      sort: "trending",
      limit: 100,
    }).groups.flatMap((g) => g.articles);

    expect(shown.map((a) => a.id).sort()).toEqual(["D", "E", "F"]);
    // 필터 결과 안에서 다시 상위를 뽑았다면 D 에 뱃지가 붙었을 것이다.
    expect(shown.filter((a) => a.isTrending)).toHaveLength(0);
  });

  it("INV-R5: 같은 글의 뱃지가 필터에 따라 붙었다 떨어지지 않는다", () => {
    const ranked = rankFeed({ items, now: NOW, weightOf });
    const badgeOf = (tag: "모델" | null) =>
      selectFeed({ articles: ranked.map(toListItem), tag, sort: "trending", limit: 100 })
        .groups.flatMap((g) => g.articles)
        .find((a) => a.id === "A")?.isTrending;

    expect(badgeOf(null)).toBe(true);
    expect(badgeOf("모델")).toBe(true);
  });

  it("INV-R5: 개수 제한으로 잘려도 남은 항목의 뱃지는 그대로다", () => {
    const ranked = rankFeed({ items, now: NOW, weightOf });
    const shown = selectFeed({
      articles: ranked.map(toListItem),
      tag: null,
      sort: "trending",
      limit: 2,
    }).groups.flatMap((g) => g.articles);
    expect(shown.map((a) => a.id)).toEqual(["A", "B"]);
    expect(shown.every((a) => a.isTrending)).toBe(true);
  });
});
