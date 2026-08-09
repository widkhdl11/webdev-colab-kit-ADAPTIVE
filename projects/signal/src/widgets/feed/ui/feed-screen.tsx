"use client";

import { useCallback, useMemo, useState } from "react";
import { selectFeed } from "@/entities/article";
import type { ArticleListItem, ArticleTag, SortMode } from "@/entities/article";
import { useReadArticles } from "@/features/read-state";
import { dayKey } from "@/shared/lib/datetime";
import { DaySection } from "./day-section";
import { FeedControls } from "./feed-controls";
import styles from "./feed.module.css";

/** 한 번에 보여줄 건수. "더 보기"를 누르면 이만큼씩 늘어난다. */
const PAGE_SIZE = 12;

interface Props {
  articles: ArticleListItem[];
  /** 서버에서 한 번 정한 기준 시각(ISO). 날짜 묶음·상대시각이 전부 이 값을 본다. */
  nowIso: string;
}

export function FeedScreen({ articles, nowIso }: Props) {
  const [sort, setSort] = useState<SortMode>("trending");
  const [tag, setTag] = useState<ArticleTag | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [notice, setNotice] = useState("");
  const { isRead } = useReadArticles();

  const { groups, shown, total } = useMemo(
    () => selectFeed({ articles, tag, sort, limit }),
    [articles, tag, sort, limit],
  );
  const todayKey = useMemo(() => dayKey(nowIso), [nowIso]);

  // 조건이 바뀌면 다시 처음부터 — 이전에 펼쳐둔 개수가 남아 있으면 결과가 뜬금없이 길어진다.
  const changeSort = useCallback((next: SortMode) => {
    setSort(next);
    setLimit(PAGE_SIZE);
    setNotice("");
  }, []);
  const changeTag = useCallback((next: ArticleTag | null) => {
    setTag(next);
    setLimit(PAGE_SIZE);
    setNotice("");
  }, []);

  return (
    <main className={styles.wrap}>
      <div className={styles.pageHead}>
        <h1>오늘의 신호</h1>
        <p>매일 아침 갱신 · 날짜별로 묶고, 하루 안에서는 점수 순으로 정리합니다.</p>
      </div>

      <FeedControls
        sort={sort}
        tag={tag}
        onSortChange={changeSort}
        onTagChange={changeTag}
      />

      {groups.length === 0 ? (
        // 필터를 켜지도 않았는데 "이 주제로는" 이라고 하면 화면이 엉뚱한 것을 탓한다.
        // 전체가 0건인 상황(수집이 아직 안 돌았거나 조회가 비어 옴)은 다른 문장이어야 한다.
        <p className={styles.empty}>
          {tag === null
            ? "아직 모인 소식이 없습니다."
            : "이 주제로 모인 소식이 아직 없습니다."}
        </p>
      ) : (
        groups.map((group) => (
          <DaySection
            key={group.dayKey}
            group={group}
            todayKey={todayKey}
            nowIso={nowIso}
            isRead={isRead}
          />
        ))
      )}

      {total > PAGE_SIZE ? (
        <div className={styles.more}>
          {/* 다 불러와도 버튼을 없애지 않는다 — 사라지는 순간 포커스가 문서 맨 위로 떨어진다 */}
          <button
            type="button"
            aria-disabled={shown >= total}
            onClick={() => {
              if (shown >= total) return;
              const next = Math.min(total, shown + PAGE_SIZE);
              setLimit((n) => n + PAGE_SIZE);
              // 누적으로 알린다. "12건 더 불러왔습니다"처럼 증가분만 쓰면 두 번째부터
              // 같은 문자열이 되고, aria-live 는 값이 안 바뀌면 아무 말도 하지 않는다.
              setNotice(`${total}건 중 ${next}건 표시`);
            }}
          >
            {shown < total ? "더 보기" : "모두 불러왔습니다"}
          </button>
        </div>
      ) : null}

      {/* 목록이 길어진 것을 화면 밖에서도 알 수 있게 */}
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
    </main>
  );
}
