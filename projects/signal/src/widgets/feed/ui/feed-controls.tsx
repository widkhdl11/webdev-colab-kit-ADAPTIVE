import type { FeedSegment } from "@/entities/article";
import styles from "./feed.module.css";

interface Props {
  segment: FeedSegment;
  onSegmentChange: (segment: FeedSegment) => void;
  /**
   * 눌린 자리 버튼의 id — 뱃지 줄이 통째로 사라질 때 포커스를 여기로 옮긴다
   * (키워드 `전체` 칩까지 같이 사라지는 경우).
   */
  pressedId?: string;
}

/**
 * 자리와 그 이름 (hot-issue.md INV-G3). 순서가 화면 순서다.
 *
 * 배열로 두고 돌린다 — 버튼을 손으로 적으면 자리가 늘 때 한 곳을 빠뜨린다.
 */
const SEGMENTS: ReadonlyArray<{ id: FeedSegment; label: string }> = [
  { id: "all", label: "전체" },
  { id: "hot", label: "핫이슈" },
  { id: "news", label: "소식" },
  { id: "tools", label: "스킬·툴" },
];

/**
 * 세그먼트 줄 — 자리 넷.
 *
 * **키워드 `전체` 칩이 여기 있었다** (2026-09-24 에 뱃지 줄 맨 앞으로 옮겼다). 자리 버튼
 * 옆에 있으니 "자리 전체"로 읽혔는데 실제로는 키워드 필터를 끄는 버튼이었다. 그 자리에는
 * 이제 자리의 `전체`(핫이슈 + 소식)가 선다.
 *
 * 버튼에 **숫자를 안 붙인다.** 붙이면 "오늘 안 읽은 소식 37건"이 되어 개수 표시 금지
 * 규칙(INV-N5)이 막으려던 그 숫자가 된다.
 */
export function FeedControls({ segment, onSegmentChange, pressedId }: Props) {
  return (
    <div className={styles.controls}>
      {/* 640px 아래에서는 이 줄이 화면 아래 고정 줄이 된다(feed.module.css `.dock`).
          한 손으로 훑는 동안 계속 쓰는 조작이라 엄지가 닿는 자리에 둔다.
          data-dock 은 body 가 아래 여백을 비울지 정하는 표식이다(app/globals.css). */}
      <div className={styles.dock} data-dock>
        <div className={styles.segment} role="group" aria-label="볼 자리">
          {/* `핫이슈`는 문턱을 넘은 것, `소식`은 못 넘은 것 전부, `전체`는 그 둘을 합친 것,
            `스킬·툴`은 툴만 모은 것이라 나머지와 겹친다(INV-G3). 정렬은 자리에서 파생돼
            따로 고르지 않는다. */}
          {SEGMENTS.map((seg) => (
            <button
              key={seg.id}
              type="button"
              id={segment === seg.id ? pressedId : undefined}
              aria-pressed={segment === seg.id}
              onClick={() => onSegmentChange(seg.id)}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
