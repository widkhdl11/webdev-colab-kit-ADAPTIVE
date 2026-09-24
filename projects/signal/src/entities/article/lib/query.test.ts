import { describe, expect, it } from "vitest";
import type { ArticleListItem, ArticleTag } from "../model/types";
import { GATE_ONE, placeArticle } from "./hot-issue";
import type { ArticleKind, Gate } from "./hot-issue";
import {
  filterByTag,
  findArticleById,
  groupByDay,
  selectFeed,
  sortArticles,
} from "./query";
import type { FeedSegment } from "./query";

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
    // 종류는 이 파일의 관심사가 아니다 — 배치를 보는 검사는 아래 세그먼트 절에 따로 있다.
    kinds: [],
    // 지금 실제 관계와 같게 둔다(교차 발행처 수가 1 이라 점수와 같은 값).
    // 둘이 갈리는 경우는 아래 「핫이슈 순서」 절이 따로 만든다.
    issueScore: score,
  // **핫이슈로 판정된 것으로 둔다.** 2026-09-21 부터 `핫이슈` 세그먼트가 실제로 거르므로
  // (hot-issue.md INV-G3), 이 값이 없으면 그 정렬에서 목록이 통째로 비어 아래 검사들이
  // "0건이라 통과"가 된다. 이 파일이 보려는 것은 거르기가 아니라 묶음·순서다.
  gate: GATE_ONE,
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
      segment: "hot",
      days: 50,
    });
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-08-05", "2026-08-04"]);
    expect(groups[0].articles[0].id).toBe("today-high");
  });

  it("날 수로 자른다 — 그날 그룹은 잘리지 않고 통째로 나온다", () => {
    // 2026-09-23 까지는 카드 장 수로 잘라서 「어제 · 2건」 아래 카드가 1장만 그려질 수 있었다.
    const { groups, shown, total, nextDay } = selectFeed({
      articles: ALL,
      tag: null,
      segment: "hot",
      days: 1,
    });
    expect(shown).toBe(2);
    expect(total).toBe(4);
    expect(groups.map((g) => g.articles.map((a) => a.id))).toEqual([
      ["today-high", "today-low"],
    ]);
    // 「더 보기」 문구가 쓰는 값 — 넘어올 날과 그날 건수
    expect(nextDay).toEqual({ dayKey: "2026-08-04", count: 2 });
  });

  it("다 펼치면 넘어올 날이 없다 — 「모두 불러왔습니다」의 근거", () => {
    const { groups, nextDay } = selectFeed({ articles: ALL, tag: null, segment: "hot", days: 2 });
    expect(groups).toHaveLength(2);
    expect(nextDay).toBeNull();
  });

  it("total 은 제한이 아니라 필터 기준이다 (더 볼 것이 남았는지 판단용)", () => {
    const tagged = [
      article("a", "2026-08-05T00:00:00.000Z", 1, ["MCP"]),
      article("b", "2026-08-05T01:00:00.000Z", 2, ["툴"]),
    ];
    const { shown, total } = selectFeed({
      articles: tagged,
      tag: "MCP",
      segment: "hot",
      days: 50,
    });
    expect(shown).toBe(1);
    expect(total).toBe(1);
  });

  it("0일이면 아무것도 그리지 않지만 total 은 남는다", () => {
    const { groups, shown, total } = selectFeed({
      articles: ALL,
      tag: null,
      segment: "hot",
      days: 0,
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
      segment: "hot",
      days: 50,
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
      segment: "hot",
      days: 50,
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
      segment: "hot",
      days: 50,
    });
    expect(shown).toBe(1);
    expect(groups).toHaveLength(1);
  });
});

/**
 * 화면이 실제로 세 자리를 그리는지 본다 (hot-issue.md INV-G3 · S32·S32b·S32c).
 *
 * **`placeArticle` 단위 테스트만으로는 부족하다.** 2026-09-21 이전이 그 상태였다 —
 * 배치 함수는 여섯 칸을 정확히 계산했고 테스트도 다 green 이었는데, 화면이 그 함수를
 * 한 번도 안 불러서 자리가 두 개뿐이었다. 그래서 여기는 화면이 쓰는 `selectFeed` 로 본다.
 */
describe("selectFeed — 세 자리 (hot-issue.md INV-G3)", () => {
  const at = (id: string, hours: number, gate: Gate | null, kinds: ArticleKind[]) => ({
    ...article(id, `2026-08-05T0${hours}:00:00.000Z`, 1),
    gate,
    kinds,
  });

  const hotNews = at("핫이슈뉴스", 1, GATE_ONE, ["news"]);
  const hotTool = at("핫이슈툴", 2, GATE_ONE, ["news", "tool"]);
  const plainNews = at("그냥뉴스", 3, null, ["news"]);
  const plainTool = at("그냥툴", 4, null, ["tool"]);
  const noKind = at("종류없음", 5, null, []);
  const ALL_SIX = [hotNews, hotTool, plainNews, plainTool, noKind];

  const idsIn = (segment: FeedSegment) =>
    selectFeed({ articles: ALL_SIX, segment, tag: null, days: 50 })
      .groups.flatMap((g) => g.articles.map((a) => a.id))
      .sort();

  it("INV-G3: `핫이슈` 는 문턱을 넘은 글 전부다 — 종류를 안 본다", () => {
    expect(idsIn("hot")).toEqual(["핫이슈뉴스", "핫이슈툴"]);
  });

  it("INV-G3: `소식` 은 문턱을 못 넘은 글 전부다 (S32b) — 툴도 종류 없는 글도 포함", () => {
    expect(idsIn("news")).toEqual(["그냥뉴스", "그냥툴", "종류없음"]);
  });

  it("INV-G3: `스킬·툴` 은 툴 전부다 — 문턱을 넘었든 아니든 (S32)", () => {
    expect(idsIn("tools")).toEqual(["그냥툴", "핫이슈툴"]);
  });

  it("INV-G3: 툴은 두 자리에 겹쳐 선다 — 스킬·툴에 있다고 소식에서 빠지지 않는다", () => {
    expect(idsIn("news")).toContain("그냥툴");
    expect(idsIn("tools")).toContain("그냥툴");
  });

  it("INV-G3 실패경로: 어느 자리에도 안 서는 글이 없다", () => {
    const anywhere = new Set([...idsIn("hot"), ...idsIn("news"), ...idsIn("tools")]);
    expect([...anywhere].sort()).toEqual(ALL_SIX.map((a) => a.id).sort());
  });

  it("INV-G3 (S32c): 자리별 건수가 배치 함수의 판정과 같다 — 화면이 다시 거르지 않는다", () => {
    for (const segment of ["hot", "news", "tools"] as const) {
      const byPlacement = ALL_SIX.filter((a) => {
        const place = placeArticle({ kinds: a.kinds, gate: a.gate });
        return segment === "hot" ? place.hotIssue : segment === "news" ? place.news : place.tools;
      });
      const got = selectFeed({ articles: ALL_SIX, segment, tag: null, days: 50 });
      expect(got.total).toBe(byPlacement.length);
    }
  });

  it("`전체` 는 들어온 글 전부다 — 핫이슈와 소식을 합친 것이고 툴이 두 번 나오지 않는다", () => {
    expect(idsIn("all")).toEqual(ALL_SIX.map((a) => a.id).sort());
    expect(selectFeed({ articles: ALL_SIX, segment: "all", tag: null, days: 50 }).total).toBe(
      ALL_SIX.length,
    );
  });

  it("`전체` 는 최신순이다 — 핫이슈의 이슈성 순서를 쓰지 않는다", () => {
    const order = selectFeed({ articles: ALL_SIX, segment: "all", tag: null, days: 50 })
      .groups.flatMap((g) => g.articles.map((a) => a.id));
    expect(order).toEqual(["종류없음", "그냥툴", "그냥뉴스", "핫이슈툴", "핫이슈뉴스"]);
  });

  it("「더 보기」 계산에 안 나오는 글이 안 섞인다", () => {
    expect(selectFeed({ articles: ALL_SIX, segment: "hot", tag: null, days: 50 }).total).toBe(2);
  });
});

/**
 * 핫이슈 자리의 **순서**는 이슈성이 정한다 (hot-issue.md INV-N3).
 *
 * **점수와 이슈성을 갈라 두는 이유가 여기 있다.** 지금 두 값은 같다 — 교차 발행처 수가
 * 항상 1 이라 두 식이 `시간감쇠 × weight` 로 같아진다. 그래서 어느 쪽으로 정렬해도
 * 결과가 같고, 잘못 이어 붙여도 아무 증상이 없다.
 *
 * 2026-09-21 까지가 정확히 그 상태였다 — `computeIssueScore` 를 아무도 안 불렀고,
 * 테스트 여섯 개가 그 함수를 붙들고 있었지만 화면은 점수로 정렬했다. 같은 사건 묶기가
 * 붙어 그 수가 1 을 넘는 날, 핫이슈 순서는 조용히 안 바뀌었을 것이다.
 *
 * 그래서 이 절은 **두 값을 일부러 어긋나게 만들어** 어느 쪽을 보는지 확인한다.
 */
describe("selectFeed — 핫이슈 순서는 이슈성이 정한다 (INV-N3)", () => {
  const withScores = (id: string, score: number, issueScore: number): ArticleListItem => ({
    ...article(id, "2026-08-05T00:00:00.000Z", score),
    gate: GATE_ONE,
    issueScore,
  });

  it("INV-N3: 점수가 같고 이슈성만 다르면 이슈성 높은 것이 먼저다", () => {
    // 점수로 정렬하면 동률이라 id 순(`ㄱ` → `ㄴ`)이 된다. 이슈성을 보면 뒤집힌다.
    const low = withScores("ㄱ낮은이슈성", 5, 1);
    const high = withScores("ㄴ높은이슈성", 5, 9);
    const got = selectFeed({ articles: [low, high], segment: "hot", tag: null, days: 50 });

    expect(got.groups.flatMap((g) => g.articles.map((a) => a.id))).toEqual([
      "ㄴ높은이슈성",
      "ㄱ낮은이슈성",
    ]);
  });

  it("INV-N3 실패경로: 이슈성이 같고 점수만 다르면 순서가 안 바뀐다 — 점수를 안 본다", () => {
    // 부재만 보면 절반이다. 위 검사만 두면 "둘 다 본다"로 바꿔도 통과한다.
    const a = withScores("ㄱ", 1, 5);
    const b = withScores("ㄴ", 9, 5);
    const got = selectFeed({ articles: [a, b], segment: "hot", tag: null, days: 50 });

    // 이슈성 동률 → 발행시각 동률 → id 순. 점수가 높은 `ㄴ` 이 앞에 오면 점수를 본 것이다.
    expect(got.groups.flatMap((g) => g.articles.map((a) => a.id))).toEqual(["ㄱ", "ㄴ"]);
  });

  it("소식 자리는 최신순이다 — 자리마다 순서가 다르다", () => {
    const older = { ...article("옛것", "2026-08-05T00:00:00.000Z", 9), gate: null, issueScore: 9 };
    const newer = { ...article("새것", "2026-08-05T05:00:00.000Z", 1), gate: null, issueScore: 1 };
    const got = selectFeed({ articles: [older, newer], segment: "news", tag: null, days: 50 });

    expect(got.groups.flatMap((g) => g.articles.map((a) => a.id))).toEqual(["새것", "옛것"]);
  });
});
