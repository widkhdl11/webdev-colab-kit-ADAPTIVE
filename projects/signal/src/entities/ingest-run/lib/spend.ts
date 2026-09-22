import { dayKey } from "@/shared/lib/datetime";
import { estimateCostBreakdown } from "./estimate-cost";
import type { IngestRunRecord } from "../model/types";

/**
 * 실행 기록 여러 건을 **하루치·한 달치 요금**으로 접는다 (2026-09-22 사용자 요청).
 *
 * 왜 필요한가: 화면이 최신 실행 하나만 보여줘서 "오늘 얼마 썼나"를 알 수 없었다.
 * 하루에 여러 번 돌면 그 합이 곧 그날 요금인데, 그 합을 어디에서도 안 냈다.
 * 요금을 줄일 자리를 고르려면 **단계별로** 나온 합이 있어야 한다 — 그래야
 * "요약이 절반이다" 같은 말이 화면에서 나온다.
 *
 * 날짜는 한국 시간으로 가른다. 사람이 "오늘"을 그렇게 세기 때문이고,
 * 실행 환경의 시간대로 세면 하루가 다른 시각에 바뀐다.
 */
export interface StageSpend {
  topicUsd: number;
  hotIssueUsd: number;
  enrichUsd: number;
  keywordUsd: number;
  totalUsd: number;
}

export interface SpendSummary {
  /** 오늘(KST) 저장된 실행들의 합. 오늘 돈 실행이 없으면 전부 0 이다. */
  today: StageSpend;
  /** 오늘 실행 건수. 0 이면 위 합이 "안 썼다"인지 "아직 안 돌았다"인지 이 값으로 갈린다. */
  todayRuns: number;
  /**
   * 하루 평균. **실행이 있었던 날 수로만 나눈다** — 기록이 없는 날을 0 으로 세면
   * 평균이 실제보다 낮아지고, 그 값으로 한 달을 곱하면 요금을 과소평가한다.
   */
  dailyAverageUsd: number;
  /** 평균을 낸 날 수. 하루치뿐이면 1 이고, 그때 월 환산은 그만큼 거친 값이다. */
  daysCounted: number;
  /** 한 달 환산 = 하루 평균 × 30. 예측이 아니라 **지금 속도가 유지되면** 의 값이다. */
  monthlyEstimateUsd: number;
}

const EMPTY: StageSpend = {
  topicUsd: 0,
  hotIssueUsd: 0,
  enrichUsd: 0,
  keywordUsd: 0,
  totalUsd: 0,
};

const add = (a: StageSpend, b: StageSpend): StageSpend => ({
  topicUsd: a.topicUsd + b.topicUsd,
  hotIssueUsd: a.hotIssueUsd + b.hotIssueUsd,
  enrichUsd: a.enrichUsd + b.enrichUsd,
  keywordUsd: a.keywordUsd + b.keywordUsd,
  totalUsd: a.totalUsd + b.totalUsd,
});

function spendOf(run: IngestRunRecord): StageSpend {
  const c = estimateCostBreakdown(run);
  return {
    topicUsd: c.topicCostUsd,
    hotIssueUsd: c.hotIssueCostUsd,
    enrichUsd: c.enrichCostUsd,
    keywordUsd: c.keywordCostUsd,
    totalUsd: c.totalCostUsd,
  };
}

export function summarizeSpend(runs: readonly IngestRunRecord[], now: Date): SpendSummary {
  const todayKey = dayKey(now.toISOString());

  let today = EMPTY;
  let todayRuns = 0;
  // 날짜별 합. 평균을 낼 때 **기록이 있는 날만** 세려고 날짜를 키로 모은다.
  const byDay = new Map<string, number>();

  for (const run of runs) {
    const key = dayKey(run.startedAt);
    const spend = spendOf(run);
    byDay.set(key, (byDay.get(key) ?? 0) + spend.totalUsd);
    if (key === todayKey) {
      today = add(today, spend);
      todayRuns += 1;
    }
  }

  const daysCounted = byDay.size;
  const sum = [...byDay.values()].reduce((a, b) => a + b, 0);
  const dailyAverageUsd = daysCounted === 0 ? 0 : sum / daysCounted;

  return {
    today,
    todayRuns,
    dailyAverageUsd,
    daysCounted,
    monthlyEstimateUsd: dailyAverageUsd * 30,
  };
}
