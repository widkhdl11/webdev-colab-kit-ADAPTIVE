import { describe, expect, it } from "vitest";

import { groupByDay, orderForFeed, parseSort } from "./order";
import type { Article } from "./types";

function make(
  id: string,
  publishedAt: string,
  score: number,
): Article {
  return {
    id,
    title: id,
    originalTitle: null,
    summary: null,
    source: "테스트",
    sourceUrl: "https://example.test",
    publishedAt,
    keywords: [],
    official: null,
    score,
    isTrending: false,
  };
}

// 이틀에 걸친 5건. 점수 순서와 시각 순서를 일부러 어긋나게 뒀다 —
// 두 정렬이 같은 답을 내면 테스트가 아무것도 안 붙들고 있는 것이다.
const SAMPLE: Article[] = [
  make("today-low", "2026-08-31T16:00:00+09:00", 10),
  make("today-high", "2026-08-31T09:00:00+09:00", 90),
  make("today-mid", "2026-08-31T12:00:00+09:00", 50),
  make("yest-high", "2026-08-30T10:00:00+09:00", 80),
  make("yest-low", "2026-08-30T18:00:00+09:00", 20),
];

describe("orderForFeed", () => {
  it("날짜가 1차다 — 어제 글이 아무리 점수가 높아도 오늘 뒤로 간다", () => {
    const hot = orderForFeed(SAMPLE, "hot").map((a) => a.id);
    // yest-high(80)가 today-low(10)보다 점수가 높지만 날짜가 먼저다.
    expect(hot.slice(0, 3)).toEqual(["today-high", "today-mid", "today-low"]);
    expect(hot.slice(3)).toEqual(["yest-high", "yest-low"]);
  });

  it("핫이슈는 점수 순, 최신은 시각 순 — 둘이 실제로 다르다", () => {
    const hot = orderForFeed(SAMPLE, "hot").map((a) => a.id);
    const latest = orderForFeed(SAMPLE, "latest").map((a) => a.id);
    expect(hot).not.toEqual(latest);
    expect(latest.slice(0, 3)).toEqual(["today-low", "today-mid", "today-high"]);
  });

  it("점수도 시각도 같으면 id 로 끊는다 — 입력 순서가 답을 정하지 않는다", () => {
    // 같은 날 · 같은 점수 · 같은 시각. 마지막 비교자가 없으면 sort 의 안정성 때문에
    // 넘긴 배열 순서가 그대로 답이 되고, ORDER BY 없는 조회에서는 그 순서가 안 정해진다.
    const at = "2026-08-31T09:00:00+09:00";
    const tie = [make("c-tie", at, 50), make("a-tie", at, 50), make("b-tie", at, 50)];
    const expected = ["a-tie", "b-tie", "c-tie"];

    expect(orderForFeed(tie, "hot").map((a) => a.id)).toEqual(expected);
    expect(orderForFeed(tie, "latest").map((a) => a.id)).toEqual(expected);
    // 순서를 뒤집어 넣어도 같은 답이어야 한다.
    expect(orderForFeed([...tie].reverse(), "hot").map((a) => a.id)).toEqual(expected);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const before = SAMPLE.map((a) => a.id);
    orderForFeed(SAMPLE, "hot");
    expect(SAMPLE.map((a) => a.id)).toEqual(before);
  });

  it("날짜를 해석할 수 없는 소식은 빠지고 나머지는 남는다", () => {
    const broken = [...SAMPLE, make("broken", "어제쯤", 999)];
    const ids = orderForFeed(broken, "hot").map((a) => a.id);
    expect(ids).not.toContain("broken");
    expect(ids).toHaveLength(SAMPLE.length);
  });

  it("UTC 로는 전날인 시각도 KST 기준 날짜로 묶는다", () => {
    // 2026-08-30T15:00Z = KST 08-31 00:00 → '오늘' 묶음에 들어가야 한다.
    const edge = [make("edge", "2026-08-30T15:00:00.000Z", 5), ...SAMPLE];
    const groups = groupByDay(orderForFeed(edge, "hot"));
    expect(groups[0]?.dayKey).toBe("2026-08-31");
    expect(groups[0]?.articles.map((a) => a.id)).toContain("edge");
  });
});

describe("groupByDay", () => {
  it("날짜별로 자르고 그룹 안 순서는 그대로 둔다", () => {
    const groups = groupByDay(orderForFeed(SAMPLE, "hot"));
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-08-31", "2026-08-30"]);
    expect(groups[0]?.articles.map((a) => a.id)).toEqual([
      "today-high",
      "today-mid",
      "today-low",
    ]);
    expect(groups[1]?.articles).toHaveLength(2);
  });

  it("빈 목록은 빈 그룹이다", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("parseSort", () => {
  it("latest 만 최신이고 나머지는 전부 기본값이다", () => {
    expect(parseSort("latest")).toBe("latest");
    expect(parseSort("hot")).toBe("hot");
    expect(parseSort(undefined)).toBe("hot");
    expect(parseSort("아무거나")).toBe("hot");
    expect(parseSort(["latest", "hot"])).toBe("hot");
  });
});
