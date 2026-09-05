import type { CSSProperties } from "react";
import { Card } from "@/shared/ui/card/Card";
import { ClockIcon } from "@/shared/ui/icon/Icon";
import { highlightVar, type Highlight } from "@/shared/ui/highlight";
import { hourMinute, WEEKDAY_NAMES } from "@/shared/lib/schedule";
import styles from "./home-hero.module.css";

export type PlannerBlock = {
  readonly key: string;
  /** 0(일) ~ 6(토) */
  readonly weekday: number;
  readonly title: string;
  /** "20:00:00" 또는 "20:00" */
  readonly startsAt: string;
  readonly color: Highlight;
};

/** 월요일부터 보여준다 — 계획을 세우는 단위가 주중부터이기 때문이다 */
const COLUMN_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function formatRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const label = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${label(monday)} – ${label(sunday)}`;
}

/** 그 주의 월요일 0시 */
export function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - shift);
  return monday;
}

/**
 * 이번 주에 무엇이 잡혀 있는지. 블록 색은 카테고리 색과 같다 —
 * 「형광펜 코딩 규칙」이 카테고리 밖으로 넓어지지 않게 여기서도 의미로만 쓴다.
 */
export function WeeklyPlanner({
  blocks,
  weekOf,
  caption,
  title = "이번 주 계획",
}: {
  blocks: readonly PlannerBlock[];
  weekOf: Date;
  caption?: string;
  title?: string;
}) {
  const monday = mondayOf(weekOf);

  return (
    <Card className={styles.planner}>
      <div className={styles.plannerHead}>
        <p className={styles.plannerName}>{title}</p>
        <p className={styles.plannerRange}>{formatRange(monday)}</p>
      </div>

      <div className={styles.plannerGrid}>
        {COLUMN_ORDER.map((weekday) => {
          const ofDay = blocks.filter((b) => b.weekday === weekday);
          const weekend = weekday === 0 || weekday === 6;
          return (
            <div className={styles.col} key={weekday}>
              <span className={weekend ? `${styles.day} ${styles.dayOff}` : styles.day}>
                {WEEKDAY_NAMES[weekday]}
              </span>
              {ofDay.length === 0 ? (
                <div className={`${styles.block} ${styles.blockEmpty}`}>비어 있음</div>
              ) : (
                ofDay.map((b) => (
                  <div
                    className={styles.block}
                    key={b.key}
                    style={{ "--fill": highlightVar(b.color) } as CSSProperties}
                  >
                    <b>{b.title}</b>
                    <time>{hourMinute(b.startsAt)}</time>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      <p className={styles.plannerFoot}>
        <ClockIcon size={16} />
        {caption ?? "블록 색은 카테고리 색과 같습니다"}
      </p>
    </Card>
  );
}
