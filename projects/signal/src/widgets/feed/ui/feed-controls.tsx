import type { ArticleTag, FeedSegment } from "@/entities/article";
import styles from "./feed.module.css";

interface Props {
  segment: FeedSegment;
  tag: ArticleTag | null;
  onSegmentChange: (segment: FeedSegment) => void;
  onTagChange: (tag: ArticleTag | null) => void;
}

/**
 * 자리 셋과 그 이름 (hot-issue.md INV-G3). 순서가 화면 순서다.
 *
 * 배열로 두고 돌린다 — 버튼 셋을 손으로 적으면 자리가 늘 때 한 곳을 빠뜨린다.
 */
const SEGMENTS: ReadonlyArray<{ id: FeedSegment; label: string }> = [
  { id: "hot", label: "핫이슈" },
  { id: "news", label: "소식" },
  { id: "tools", label: "스킬·툴" },
];

/**
 * 세그먼트 줄 — 자리 셋 + `전체` 칩.
 *
 * **고정 5개 태그 칩이 여기 있었다** (2026-08-30 제거). 태그가 목록에서 고르는 것이
 * 아니게 되면서(badge-keywords INV-B1) 다섯 개를 그릴 근거가 없어졌고, 그 자리는
 * 아래 뱃지 줄(`KeywordBadges`)이 물려받았다 — 칩이 수십 개가 되므로 한 줄에 못 둔다.
 *
 * `전체` 칩에는 **숫자를 안 붙인다.** 붙이면 "오늘 안 읽은 소식 37건"이 되어
 * 개수 표시 금지 규칙(INV-N5)이 막으려던 그 숫자가 된다 — 뱃지 숫자는 수십 개 중
 * 무엇을 누를지 고르는 정보라 예외지만, 하나로 합친 숫자는 그대로 할당량이 된다.
 */
export function FeedControls({ segment, tag, onSegmentChange, onTagChange }: Props) {
  return (
    <div className={styles.controls}>
      <div className={styles.segment} role="group" aria-label="볼 자리">
        {/* 2026-09-21 에 두 개에서 세 개가 됐다. 그 전에는 이 줄이 정렬 토글이었고
            (`핫이슈`/`최신`), 이름만 자리처럼 보였다. 지금은 실제로 다른 글을 보여준다 —
            `핫이슈`는 문턱을 넘은 것, `소식`은 못 넘은 것 전부, `스킬·툴`은 툴만 모은 것이라
            앞의 둘과 겹친다(INV-G3). 정렬은 자리에서 파생돼 따로 고르지 않는다. */}
        {SEGMENTS.map((seg) => (
          <button
            key={seg.id}
            type="button"
            aria-pressed={segment === seg.id}
            onClick={() => onSegmentChange(seg.id)}
          >
            {seg.label}
          </button>
        ))}
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
