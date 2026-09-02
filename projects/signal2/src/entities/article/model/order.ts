/* 피드에 보이는 순서. 화면 둘이 같은 답을 봐야 해서 여기 하나로 둔다.
 *
 * 피드는 이 순서로 카드를 그리고, 상세는 같은 순서에서 앞뒤 글을 찾는다.
 * 두 곳에서 따로 정렬하면 "다음 글"이 피드에서 아래 있던 글과 달라진다 —
 * 그건 화면이 거짓말을 하는 것이고, 눈으로는 한참 뒤에야 알아챈다.
 */

import { kstDayKey } from "@/shared/lib/kst";

import type { Article } from "./types";

export type FeedSort = "hot" | "latest";

/** 신원 비교(코드포인트). 사람이 읽는 정렬이 아니므로 로케일을 안 탄다. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 날짜가 1차 묶음이고 정렬은 그 안에서 2차다.
 * 점수가 날짜를 가로지르면 "오늘 뭐 왔지"를 볼 수 없다.
 *
 * 날짜를 해석할 수 없는 소식은 **빠진다.** 예전에 그런 한 건이 페이지 전체를 500 으로
 * 만든 적이 있다 — 한 건 때문에 나머지를 못 보는 것보다 그 한 건이 안 보이는 편이 낫다.
 */
export function orderForFeed(articles: Article[], sort: FeedSort): Article[] {
  const dated = articles
    .map((article) => ({ article, dayKey: kstDayKey(article.publishedAt) }))
    .filter((x): x is { article: Article; dayKey: string } => x.dayKey !== null);

  dated.sort((x, y) => {
    // 날짜 키가 `2026-08-31` 꼴이라 문자열 비교가 곧 날짜 비교다.
    if (x.dayKey !== y.dayKey) return x.dayKey < y.dayKey ? 1 : -1;

    if (sort === "hot") {
      if (y.article.score !== x.article.score) return y.article.score - x.article.score;
    } else {
      const yt = Date.parse(y.article.publishedAt);
      const xt = Date.parse(x.article.publishedAt);
      if (yt !== xt) return yt - xt;
    }

    // **마지막 비교자가 없으면 입력 배열 순서가 답을 정한다.** 지금은 더미가 항상 같은
    // 순서를 주지만, 점수가 `시간감쇠 × 소스 weight` 라 같은 날 같은 소스의 두 글은
    // 같은 점수가 되기 쉽고, `ORDER BY` 없는 조회는 순서를 보장하지 않는다.
    // 그러면 새로고침마다 카드 자리가 바뀌고 상세의 「다음 글」도 같이 흔들린다.
    //
    // **`localeCompare` 를 안 쓴다.** 이건 사람이 읽는 정렬이 아니라 신원 비교다.
    // 로케일을 안 주면 런타임 기본값에 답이 걸리는데, 이 함수는 서버(SSR)와 브라우저
    // (하이드레이션 뒤 useMemo)에서 같은 입력으로 각각 돌기 때문에 두 환경의 콜레이션이
    // 다르면 동점 카드 순서가 갈린다 — 이 비교자를 넣은 이유가 바로 그 흔들림이다.
    // 콜레이션은 서로 다른 문자열에 0 을 주기도 해서 "마지막"이 마지막이 아니게 된다.
    return compareIds(x.article.id, y.article.id);
  });

  return dated.map((x) => x.article);
}

/** 정렬된 목록을 날짜별로 자른다. 순서는 orderForFeed 가 이미 정했으므로 여기서 안 바꾼다. */
export function groupByDay(
  ordered: Article[],
): { dayKey: string; articles: Article[] }[] {
  const groups: { dayKey: string; articles: Article[] }[] = [];
  for (const article of ordered) {
    const dayKey = kstDayKey(article.publishedAt);
    if (dayKey === null) continue;
    const last = groups.at(-1);
    if (last?.dayKey === dayKey) last.articles.push(article);
    else groups.push({ dayKey, articles: [article] });
  }
  return groups;
}

/** URL 에서 온 값을 정렬로 읽는다. 모르는 값은 기본값(핫이슈)이다. */
export function parseSort(raw: string | string[] | undefined): FeedSort {
  return raw === "latest" ? "latest" : "hot";
}
