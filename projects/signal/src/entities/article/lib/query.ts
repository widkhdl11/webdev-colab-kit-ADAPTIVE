import { dayKey } from "@/shared/lib/datetime";
import type { ArticleListItem, ArticleTag } from "../model/types";
import { compareForRanking } from "./ranking";

/**
 * 피드 목록을 고르는 규칙.
 *
 * 핵심 규칙 하나: **날짜 그룹이 1차, 정렬은 그 안에서 2차.**
 * 수집이 매일 아침 한 번 도는 배치라 "오늘 뭐 왔지"가 기본 질문이다.
 * 점수가 날짜를 가로질러 섞이면 하루 단위로 훑을 수 없다.
 */

export type SortMode = "trending" | "latest";

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
  return articles.filter((a) => a.tags.includes(tag));
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
  tag: ArticleTag | null;
  sort: SortMode;
  limit: number;
}): FeedSelection<T> {
  const { articles, tag, sort, limit } = params;
  const filtered = filterByTag(articles, tag);
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
