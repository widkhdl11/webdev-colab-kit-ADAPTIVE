import Link from "next/link";
import type { DayOutcome, DayStatus } from "@/entities/ingest-run";
import { dayHeading, fullDateKo, fullDateTimeKo } from "@/shared/lib/datetime";
import styles from "./daily-result.module.css";

interface Props {
  days: DayOutcome[];
  selectedDay: string;
  todayKey: string;
}

/** 불빛 옆에 항상 같이 적는 말 — 색만으로 상태를 알리지 않는다(design-rules). */
const STATUS_TEXT: Record<DayStatus, string> = {
  ok: "성공",
  fail: "실패",
  pending: "아직 실행 전",
};

const DOT_CLASS: Record<DayStatus, string | undefined> = {
  ok: styles.dotOk,
  fail: styles.dotFail,
  pending: styles.dotPending,
};

function Dot({ status }: { status: DayStatus }) {
  // 장식이다 — 같은 뜻의 글자가 옆에 있거나(결과 카드) 스크린리더용 글자를 따로 둔다(날짜 줄).
  return <span className={`${styles.dot} ${DOT_CLASS[status] ?? ""}`} aria-hidden="true" />;
}

/**
 * 날짜 줄 + 그날 처리 결과 (2026-09-27 사용자 요청).
 * 판정(무엇이 실패인가)은 entities/ingest-run 의 `summarizeDays` 가 하고 여기선 그리기만 한다.
 */
export function DailyResult({ days, selectedDay, todayKey }: Props) {
  const selected = days.find((d) => d.day === selectedDay) ?? null;

  return (
    <>
      <nav className={styles.dayNav} aria-label="날짜 선택">
        <ul>
          {days.map((d) => (
            <li key={d.day}>
              <Link
                href={`?day=${d.day}`}
                className={d.day === selectedDay ? styles.dayActive : styles.day}
                aria-current={d.day === selectedDay ? "date" : undefined}
              >
                <Dot status={d.status} />
                {dayHeading(d.day, todayKey)}
                {/* 실패는 눈에도 글자로 — 점 색만으로 가르면 색약·흑백에서 안 보인다. 성공·실행 전은 스크린리더에만 */}
                {d.status === "fail" ? (
                  <span className={styles.failText}> 실패</span>
                ) : (
                  <span className={styles.srOnly}> — {STATUS_TEXT[d.status]}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {selected === null ? null : (
        <section className={styles.card} aria-label="그날 처리 결과">
          <p className={styles.when}>
            {/* 실행이 없는 날은 시각이 없다 — 날짜만 적는다 */}
            {selected.firstStartedAt === null
              ? fullDateKo(selected.day)
              : fullDateTimeKo(selected.firstStartedAt)}
            {selected.runCount > 1 ? <span className={styles.sub}> · 실행 {selected.runCount}회</span> : null}
          </p>
          <dl className={styles.rows}>
            <div>
              <dt>작업 결과</dt>
              <dd className={styles.status}>
                <Dot status={selected.status} />
                {STATUS_TEXT[selected.status]}
              </dd>
            </div>
            <div>
              <dt>이유</dt>
              <dd>
                {selected.reasons.length === 0 ? (
                  "—"
                ) : (
                  <ul className={styles.lines}>
                    {selected.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            {selected.notes.length === 0 ? null : (
              <div>
                <dt>참고</dt>
                <dd>
                  <ul className={`${styles.lines} ${styles.notes}`}>
                    {selected.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </>
  );
}
