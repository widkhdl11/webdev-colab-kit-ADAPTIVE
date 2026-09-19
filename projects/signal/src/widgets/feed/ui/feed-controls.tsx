import type { ArticleTag, SortMode } from "@/entities/article";
import styles from "./feed.module.css";

interface Props {
  sort: SortMode;
  tag: ArticleTag | null;
  onSortChange: (sort: SortMode) => void;
  onTagChange: (tag: ArticleTag | null) => void;
}

/**
 * 세그먼트 줄 — 정렬 토글 + `전체` 칩.
 *
 * **고정 5개 태그 칩이 여기 있었다** (2026-08-30 제거). 태그가 목록에서 고르는 것이
 * 아니게 되면서(badge-keywords INV-B1) 다섯 개를 그릴 근거가 없어졌고, 그 자리는
 * 아래 뱃지 줄(`KeywordBadges`)이 물려받았다 — 칩이 수십 개가 되므로 한 줄에 못 둔다.
 *
 * `전체` 칩에는 **숫자를 안 붙인다.** 붙이면 "오늘 안 읽은 소식 37건"이 되어
 * 개수 표시 금지 규칙(INV-N5)이 막으려던 그 숫자가 된다 — 뱃지 숫자는 수십 개 중
 * 무엇을 누를지 고르는 정보라 예외지만, 하나로 합친 숫자는 그대로 할당량이 된다.
 */
export function FeedControls({ sort, tag, onSortChange, onTagChange }: Props) {
  return (
    <div className={styles.controls}>
      <div className={styles.segment} role="group" aria-label="정렬 방식">
        {/* 이름만 바꿨다 — `핫이슈` 는 거르지 않는다(2026-08-27 사용자 결정, 대가를 알고 감수).
            지금 점수는 시간감쇠 × 소스 weight 뿐이라 내용을 안 본다. 두 쪽 다 같은 글
            전부를 보여주고 날짜 묶음 안에서 순서만 다르다. 스펙의 진짜 핫이슈 판정(INV-G2)이
            붙으면 그 자리를 물려받는다. 이걸 말해 주는 자리는 페이지 부제뿐이다. */}
        <button
          type="button"
          aria-pressed={sort === "trending"}
          onClick={() => onSortChange("trending")}
        >
          핫이슈
        </button>
        <button
          type="button"
          aria-pressed={sort === "latest"}
          onClick={() => onSortChange("latest")}
        >
          최신
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
      </div>
    </div>
  );
}
