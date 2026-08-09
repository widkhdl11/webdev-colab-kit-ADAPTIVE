import { ARTICLE_TAGS } from "@/entities/article";
import type { ArticleTag, SortMode } from "@/entities/article";
import styles from "./feed.module.css";

interface Props {
  sort: SortMode;
  tag: ArticleTag | null;
  onSortChange: (sort: SortMode) => void;
  onTagChange: (tag: ArticleTag | null) => void;
}

/** 시그니처: 알약 필터 칩 줄 — 정렬 세그먼트 토글 + 주제 태그 칩이 목록 위에 나란히. */
export function FeedControls({ sort, tag, onSortChange, onTagChange }: Props) {
  return (
    <div className={styles.controls}>
      <div className={styles.segment} role="group" aria-label="정렬 방식">
        <button
          type="button"
          aria-pressed={sort === "trending"}
          onClick={() => onSortChange("trending")}
        >
          뜨는순
        </button>
        <button
          type="button"
          aria-pressed={sort === "latest"}
          onClick={() => onSortChange("latest")}
        >
          최신순
        </button>
      </div>

      <span className={styles.dividerV} aria-hidden="true" />

      <div className={styles.chipsRow} role="group" aria-label="주제 필터">
        <button
          type="button"
          className={styles.filterChip}
          aria-pressed={tag === null}
          onClick={() => onTagChange(null)}
        >
          전체
        </button>
        {ARTICLE_TAGS.map((name) => (
          <button
            key={name}
            type="button"
            className={styles.filterChip}
            aria-pressed={tag === name}
            onClick={() => onTagChange(name)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
