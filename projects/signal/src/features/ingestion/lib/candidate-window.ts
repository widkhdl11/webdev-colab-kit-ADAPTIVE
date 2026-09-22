import { dayKey, dayStartIso } from "@/shared/lib/datetime";
import { CANDIDATE_WINDOW_DAYS } from "./budgets";

/**
 * 비싼 단계(본문 긁기·요약·번역·핫이슈 판정·키워드)가 **볼 글의 범위**.
 *
 * 왜 창을 거나 (2026-09-22 사용자 결정): 후보가 전체 기간이면 대기열이 유입량보다 빨리
 * 자라서 영영 안 줄어든다. 실측으로 요약 없는 글이 1,560건이었고, 고르는 기준이
 * 최신순이라 그 글들은 **다음 주기에도 그다음에도 순위 안에 못 든다.** 즉 대기열이
 * 아니라 영구 누락이었다. 그 상태로 한 바퀴 예산만 키우면 요금만 늘고 밀린 것은 그대로다.
 *
 * 창 밖 글을 **지우지는 않는다.** 화면에는 그대로 있고, 요약·키워드가 없을 뿐이다.
 *
 * 날짜 단위로 자르는 이유: 뱃지 줄의 창(`BADGE_WINDOW_DAYS`)도 날짜 단위라, 여기만
 * "72시간 전부터"로 하면 **뱃지에는 있는데 키워드는 안 붙는 날**이 생긴다. 같은 기준을 쓴다.
 */
export function candidateWindowStartIso(
  now: Date,
  days: number = CANDIDATE_WINDOW_DAYS,
): string | null {
  // 읽을 수 없는 시각이면 창을 안 건다. `toISOString()` 은 그런 값에 **던진다** —
  // 여기서 막지 않으면 후보 조회가 통째로 죽고, 그 단계가 그날 아무 일도 못 한다.
  if (Number.isNaN(now.getTime())) return null;
  // 오늘을 포함해 `days` 일이다 — 3일이면 그저께 0시(KST)부터다.
  const todayKey = dayKey(now.toISOString());
  const start = dayStartIso(todayKey);
  if (start === null) return null;
  const startMs = Date.parse(start) - (days - 1) * 24 * 60 * 60 * 1000;
  return Number.isNaN(startMs) ? null : new Date(startMs).toISOString();
}
