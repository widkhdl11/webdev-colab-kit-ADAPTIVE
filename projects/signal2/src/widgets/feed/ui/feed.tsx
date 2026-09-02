"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useMemo, useOptimistic } from "react";

import type { Article, FeedState } from "@/entities/article";
import {
  buildKeywordBadges,
  feedHref,
  filterByKeyword,
  groupByDay,
  orderForFeed,
  parseFeedState,
  withKeyword,
  withMoreDays,
  withSort,
} from "@/entities/article";
import { useReadIds } from "@/features/read-state";
import { dayGroupLabel } from "@/shared/lib/kst";

import { ArticleCard } from "./article-card";
import styles from "./feed.module.css";
import { KeywordBadges } from "./keyword-badges";

type DayGroup = {
  dayKey: string;
  label: string;
  articles: Article[];
};

type Props = {
  articles: Article[];
  /** 서버가 렌더한 시각. 하이드레이션이 다른 값을 보지 않게 밖에서 받는다. */
  nowIso: string;
};

export function Feed({ articles, nowIso }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const readIds = useReadIds();

  /**
   * 정렬·필터·펼친 날 수를 **주소에서 읽는다.** 로컬 `useState` 로 들고 있지 않는 이유는
   * 뒤로가기 때문이다 — state 가 근거면 주소는 베껴 쓴 사본이 되고, 히스토리를 오갈 때
   * 둘이 갈린다(실제로 「최신」이 뒤로가기 한 번에 「핫이슈」로 돌아갔다).
   * 주소가 근거면 뒤로·앞으로가 저절로 맞는다.
   */
  const fromUrl = useMemo(
    () => parseFeedState((key) => searchParams.get(key)),
    [searchParams],
  );

  /**
   * **마지막으로 요청한 상태를 화면이 본다.**
   *
   * `router.replace` 는 트랜지션이라 서버 렌더가 끝나야 커밋된다. 그동안
   * `useSearchParams()` 는 예전 값을 주므로, 그 값을 근거로 다음 요청을 만들면 두 가지가 깨진다 —
   * 「더 보기」를 연타하면 둘 다 `days: 1+1` 을 요청해 **하루만 늘고**(실측: 두 번 눌러 `days=2`),
   * 뱃지를 켠 직후 정렬을 바꾸면 `state.keyword` 가 아직 `null` 이라 **켠 필터가 소리 없이 풀린다.**
   *
   * `useOptimistic` 은 트랜지션이 끝나면 저절로 서버 값으로 되돌아와서, 뒤로가기로 들어온
   * 주소와도 안 싸운다. 덤으로 클릭이 즉시 화면에 반영돼 연타 자체가 줄어든다.
   */
  const [state, setRequested] = useOptimistic(fromUrl);
  const { sort, keyword, days } = state;

  // 주소를 갈아 끼운다. `replace` 라 히스토리가 안 쌓이고, 스크롤도 그대로 둔다 —
  // 정렬을 바꿨는데 화면이 맨 위로 튀면 보던 자리를 잃는다.
  const go = (next: FeedState) =>
    startTransition(() => {
      setRequested(next);
      router.replace(feedHref(next), { scroll: false });
    });

  // 뱃지 줄은 **거르기 전** 목록으로 만든다. 켠 뱃지 때문에 다른 뱃지가 사라지면
  // 하나를 켠 뒤로는 다른 것으로 갈아탈 수가 없다.
  const badges = useMemo(
    () => buildKeywordBadges(articles, readIds, nowIso),
    [articles, readIds, nowIso],
  );

  const { shown, nextDay, totalArticles, shownArticles } = useMemo(() => {
    const filtered = filterByKeyword(articles, keyword);
    const all: DayGroup[] = groupByDay(orderForFeed(filtered, sort)).map((g) => ({
      dayKey: g.dayKey,
      label: dayGroupLabel(g.dayKey, nowIso),
      articles: g.articles,
    }));

    const visible = all.slice(0, days);
    return {
      shown: visible,
      nextDay: all[days] ?? null,
      totalArticles: all.reduce((n, g) => n + g.articles.length, 0),
      shownArticles: visible.reduce((n, g) => n + g.articles.length, 0),
    };
  }, [articles, sort, days, nowIso, keyword]);

  const allLoaded = nextDay === null;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>오늘의 신호</h1>
        <p>매일 아침 갱신 · 날짜별로 묶고, 하루 안에서는 점수 순으로 정리합니다.</p>
      </div>

      <KeywordBadges
        badges={badges}
        selectedKey={keyword}
        // 켤 때 집계 창만큼 펴고 끌 때 안 줄이는 규칙은 entities 에 있다(withKeyword).
        onSelect={(key) => go(withKeyword(state, key))}
      />

      {/* 640px 아래에서는 이 줄이 화면 아래 고정 줄이 된다(feed.module.css).
          한 손으로 훑는 동안 계속 쓰는 조작이라 엄지가 닿는 자리에 둔다.
          data-dock 은 body 가 아래 여백을 비울지 정하는 표식이다(app/globals.css). */}
      <div className={styles.controls} data-dock>
        <div className={styles.segment} role="group" aria-label="정렬 방식">
          {/* 둘 다 같은 글 전부를 보여주고 날짜 묶음 안에서 순서만 다르다 — 핫이슈는 거르지 않는다. */}
          <button
            type="button"
            className={styles.segButton}
            aria-pressed={sort === "hot"}
            onClick={() => go(withSort(state, "hot"))}
          >
            핫이슈
          </button>
          <button
            type="button"
            className={styles.segButton}
            aria-pressed={sort === "latest"}
            onClick={() => go(withSort(state, "latest"))}
          >
            최신
          </button>
        </div>
      </div>

      {/* 빈 상태의 문구는 두 가지다. 켜지도 않은 필터를 탓하면 화면이 엉뚱한 것을 가리킨다.
          형태는 같다 — 문장 한 줄. 일러스트·재시도 버튼을 두지 않는다. */}
      {totalArticles === 0 && (
        <p className={styles.empty}>
          {keyword === null
            ? "아직 모인 소식이 없습니다"
            : "이 주제로 모인 소식이 아직 없습니다"}
        </p>
      )}

      {shown.map((group) => (
        <section
          key={group.dayKey}
          className={styles.day}
          aria-labelledby={`day-${group.dayKey}`}
        >
          <div className={styles.dayHead}>
            <h2 className={styles.dayTitle} id={`day-${group.dayKey}`}>
              {group.label}
            </h2>
            {/* 하루씩 불러오므로 이 건수는 화면의 카드 수와 항상 같다. */}
            <span className={styles.dayCount}>{group.articles.length}건</span>
            <span className={styles.dayRule} aria-hidden="true" />
          </div>

          <div className={styles.grid}>
            {group.articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                nowIso={nowIso}
                feedState={state}
                isRead={readIds.has(article.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* 다 불러온 뒤에도 버튼을 없애지 않는다 — 사라지면 키보드 포커스가 페이지 맨 위로 튄다.
          문구에 넘어올 날의 건수를 적어, 눌러 보기 전에 그날이 한산한지 알 수 있게 한다. */}
      <div className={styles.more}>
        <button
          type="button"
          className={styles.moreButton}
          aria-disabled={allLoaded}
          onClick={() => {
            if (!allLoaded) go(withMoreDays(state));
          }}
        >
          {nextDay === null
            ? "모두 불러왔습니다"
            : `더 보기 · ${nextDay.label} ${nextDay.articles.length}건`}
        </button>
      </div>

      {/* 늘어난 건수는 화면 밖으로도 알린다. */}
      <p className="sr-only" aria-live="polite">
        {`소식 ${totalArticles}건 중 ${shownArticles}건을 보고 있습니다`}
      </p>
    </>
  );
}
