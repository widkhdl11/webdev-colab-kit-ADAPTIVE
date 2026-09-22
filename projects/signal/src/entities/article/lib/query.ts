import { dayKey } from "@/shared/lib/datetime";
import type { ArticleListItem, ArticleTag } from "../model/types";
import { placeArticle } from "./hot-issue";
import { compareByIssue, compareForRanking } from "./ranking";
import { normalizeTagName } from "./tagging";

/**
 * 피드 목록을 고르는 규칙.
 *
 * 핵심 규칙 하나: **날짜 그룹이 1차, 정렬은 그 안에서 2차.**
 * 수집이 매일 아침 한 번 도는 배치라 "오늘 뭐 왔지"가 기본 질문이다.
 * 점수가 날짜를 가로질러 섞이면 하루 단위로 훑을 수 없다.
 */

/**
 * 정렬 방식. `issue` 는 **핫이슈 자리 전용**이다 (hot-issue.md INV-N3).
 *
 * `trending`(점수순)과 지금은 결과가 같다 — 교차 발행처 수가 항상 1 이라 두 식이 같다.
 * 그래도 갈라 두는 이유는 그 수가 1 을 넘는 날 핫이슈 순서만 바뀌어야 하기 때문이다.
 */
export type SortMode = "trending" | "latest" | "issue";

/**
 * 아래 함수들은 목록 투영(ArticleListItem)만 있으면 동작한다 — 본문을 안 본다.
 * 제네릭으로 둬서 Article 을 넘기면 Article 이, 투영을 넘기면 투영이 그대로 나온다.
 */
export interface ArticleDayGroup<T extends ArticleListItem = ArticleListItem> {
  /** `YYYY-MM-DD` (KST 기준). 제목 문구는 표시 단계에서 만든다. */
  dayKey: string;
  articles: T[];
}

/** id 만 있으면 되므로 전체 Article 이든 목록 투영이든 받는다. */
export function findArticleById<T extends { id: string }>(
  articles: readonly T[],
  id: string,
): T | undefined {
  return articles.find((a) => a.id === id);
}

export function filterByTag<T extends ArticleListItem>(
  articles: readonly T[],
  tag: ArticleTag | null,
): T[] {
  if (tag === null) return [...articles];
  // **정규화 키로 맞춘다.** 뱃지 줄은 표기가 갈린 것을 한 뱃지로 합쳐 보여주므로
  // (buildKeywordBadges), 뱃지에 적힌 표기와 글에 붙은 표기가 다를 수 있다.
  // 이름을 그대로 비교하면 그 글들이 필터에서 조용히 빠진다 — 뱃지 숫자와 결과 수가 안 맞는다.
  const key = normalizeTagName(tag);
  return articles.filter((a) => a.tags.some((t) => normalizeTagName(t.name) === key));
}

/** 화면의 세 자리 (hot-issue.md INV-G3). */
export type FeedSegment = "hot" | "news" | "tools";

/**
 * 자리마다의 정렬 (ingestion-ranking INV-R3).
 *
 * 자리에서 파생시키고 따로 고르게 하지 않는다 — `핫이슈` 는 "무엇이 중요한가"를 보는
 * 자리라 점수순이 맞고, `소식`·`스킬·툴` 은 훑는 자리라 최신순이 맞다. 두 축(자리·정렬)을
 * 다 열면 조합이 여섯 개가 되는데 그중 넷은 아무도 안 쓴다.
 */
const SEGMENT_SORT: Record<FeedSegment, SortMode> = {
  // 핫이슈는 **이슈성** 순이다 (INV-N3). 점수순(`trending`)과 지금 결과가 같지만,
  // 같은 사건 묶기가 붙는 날 이 자리만 바뀌어야 한다.
  hot: "issue",
  news: "latest",
  tools: "latest",
};

/**
 * 그 자리에 서는 글만 남긴다 (hot-issue.md INV-G3).
 *
 * **판정은 `placeArticle` 하나가 한다.** 여기서 `gate !== null` 같은 조건을 다시 쓰면
 * 배치 규칙이 두 곳에 생기고, 고칠 때 한쪽만 고치는 날이 온다 — 2026-09-21 이전이 정확히
 * 그 상태였다(배치 함수는 있는데 화면이 안 불렀다).
 */
export function inSegment<T extends ArticleListItem>(
  articles: readonly T[],
  segment: FeedSegment,
): T[] {
  return articles.filter((a) => {
    const at = placeArticle({ kinds: a.kinds, gate: a.gate });
    if (segment === "hot") return at.hotIssue;
    if (segment === "news") return at.news;
    return at.tools;
  });
}

/**
 * 정렬 (ingestion-ranking INV-R3): 같은 데이터·같은 조회시각이면 **항상 같은 순서**다.
 *
 * '뜨는순'은 랭킹 비교자를 그대로 쓴다(점수 → 발행시각 → id).
 * '최신순'도 마지막에 id 로 가른다 — 여기서 0 을 돌려주면 동률 항목의 순서가
 * 정렬 구현에 맡겨지고, 새로고침마다 순서가 흔들려 훑기를 방해한다.
 */
export function sortArticles<T extends ArticleListItem>(
  articles: readonly T[],
  mode: SortMode,
): T[] {
  if (mode === "trending") return [...articles].sort(compareForRanking);
  if (mode === "issue") return [...articles].sort(compareByIssue);

  return [...articles].sort((a, b) => {
    const at = Date.parse(a.publishedAt) || 0;
    const bt = Date.parse(b.publishedAt) || 0;
    if (at !== bt) return bt - at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 날짜별로 묶는다. 그룹은 최신 날짜부터, 그룹 안 순서는 받은 그대로 둔다(정렬은 2차). */
export function groupByDay<T extends ArticleListItem>(
  articles: readonly T[],
): ArticleDayGroup<T>[] {
  const groups: ArticleDayGroup<T>[] = [];
  const byKey = new Map<string, ArticleDayGroup<T>>();

  for (const article of articles) {
    const key = dayKey(article.publishedAt);
    // 발행시각을 못 읽는 항목은 날짜 묶음에서 뺀다. 수집 경계가 보장하는 값이라
    // (ingestion-ranking INV-C5) 정상 경로에서는 생기지 않지만, 그 약속이 깨졌을 때
    // 카드 한 장이 빠지는 것과 목록 전체가 사라지는 것은 다르다.
    if (key === "") continue;
    let group = byKey.get(key);
    if (!group) {
      group = { dayKey: key, articles: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.articles.push(article);
  }

  return groups.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
}

export interface FeedSelection<T extends ArticleListItem = ArticleListItem> {
  groups: ArticleDayGroup<T>[];
  /** 지금 화면에 그려진 건수. */
  shown: number;
  /** 필터를 통과한 전체 건수. shown < total 이면 더 볼 것이 남았다. */
  total: number;
}

/**
 * 필터 → 정렬 → 날짜 묶음 → 개수 제한을 한 번에.
 * 개수 제한은 날짜를 가로질러 앞에서부터 자른다(그래야 "오늘"이 먼저 다 보인다).
 */
export function selectFeed<T extends ArticleListItem>(params: {
  articles: readonly T[];
  segment: FeedSegment;
  tag: ArticleTag | null;
  limit: number;
}): FeedSelection<T> {
  const { articles, segment, tag, limit } = params;
  const sort = SEGMENT_SORT[segment];
  // 자리로 거르는 것이 **정렬보다 먼저**다 — 뒤에 두면 그 자리에 안 서는 글이
  // 「더 보기」 계산에 섞여 화면에 안 나오는 건수가 total 에 남는다.
  const filtered = filterByTag(inSegment(articles, segment), tag);
  const ordered = groupByDay(sortArticles(filtered, sort)).flatMap(
    (g) => g.articles,
  );
  const visible = ordered.slice(0, Math.max(0, limit));

  return {
    groups: groupByDay(visible),
    shown: visible.length,
    // 버린 항목(발행시각 파싱 실패)은 total 에서도 빠져야 한다. filtered.length 를 쓰면
    // 그릴 수 없는 항목이 건수에 남아 shown < total 이 영원히 참이 되고,
    // "더 보기"가 눌러도 아무 일 없는 버튼으로 굳는다.
    total: ordered.length,
  };
}
