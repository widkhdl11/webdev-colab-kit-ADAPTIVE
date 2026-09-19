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
  tagNames: ArticleTag[] = ["모델"],
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
    // 필터는 이름으로 맞춘다 — 축은 이 파일의 관심사가 아니다.
    tags: tagNames.map((name) => ({ name, axis: "field" as const })),
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

  /**
   * 표기가 갈린 것을 뱃지 줄은 한 뱃지로 합쳐 보여준다(buildKeywordBadges 는 `normalizeTagName`
   * 키로 접는다). 필터가 이름을 그대로 비교하면 **뱃지 숫자와 결과 수가 안 맞는다** —
   * `온-디바이스 2` 라고 떠 있는데 눌러도 1건만 나온다.
   *
   * 2026-08-31 감사 지적: 위 세 케이스는 전부 표기가 글자까지 같은 입력이라, 정규화를
   * 이름 그대로 비교로 되돌려도 하나도 안 깨졌다.
   */
  it("표기가 갈린 태그를 한 필터로 잡는다 — 정규화 키로 맞춘다", () => {
    const a = article("a", "2026-08-05T00:00:00.000Z", 1, ["온-디바이스"]);
    const b = article("b", "2026-08-05T01:00:00.000Z", 1, ["온_디바이스"]);
    expect(filterByTag([a, b], "온-디바이스")).toHaveLength(2);
    expect(filterByTag([a, b], "온_디바이스")).toHaveLength(2);
  });

  it("대소문자가 달라도 잡는다", () => {
    const a = article("a", "2026-08-05T00:00:00.000Z", 1, ["mcp"]);
    expect(filterByTag([a], "MCP")).toHaveLength(1);
  });

  it("실패경로: 서로 다른 말까지 합치지는 않는다", () => {
    // 위 셋만 있으면 "전부 통과시킨다"는 구현도 green 이다.
    const a = article("a", "2026-08-05T00:00:00.000Z", 1, ["프론트엔드"]);
    expect(filterByTag([a], "웹 프론트엔드")).toEqual([]);
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

/**
 * INV-B4 뒷절 — **창은 뱃지 집계에만 걸고 글 목록에는 안 건다.**
 *
 * 조항이 지목한 사고가 "글까지 지우면 '며칠 못 봤더니 없어졌다'가 된다"인데,
 * 그 방향을 보는 테스트가 2026-08-31 감사 전까지 하나도 없었다 — badges.test.ts 는
 * "창 밖은 안 센다"(앞절)만 본다. 둘을 같이 둬야 `selectFeed` 에 창을 거는 변이가 잡힌다.
 */
describe("selectFeed — INV-B4 (BK16) 뱃지 창이 글 목록을 자르지 않는다", () => {
  it("뱃지 창(3일)보다 오래된 글도 목록에는 그대로 있다", () => {
    const old = article("old", "2026-07-01T00:00:00.000Z", 5);
    const fresh = article("fresh", "2026-08-05T00:00:00.000Z", 5);
    const { groups, total } = selectFeed({
      articles: [old, fresh],
      tag: null,
      sort: "latest",
      limit: 50,
    });
    expect(total).toBe(2);
    const ids = groups.flatMap((g) => g.articles.map((a) => a.id));
    expect(ids).toContain("old");
  });

  it("아주 오래된 글만 있어도 목록이 비지 않는다", () => {
    // 창을 걸면 여기서 groups 가 통째로 비고 화면이 '아직 모인 소식이 없습니다' 가 된다.
    const old = article("old", "2025-01-01T00:00:00.000Z", 5);
    const { groups, shown } = selectFeed({
      articles: [old],
      tag: null,
      sort: "latest",
      limit: 50,
    });
    expect(shown).toBe(1);
    expect(groups).toHaveLength(1);
  });
});
