import type { IngestRunSourceStat } from "../model/types";

/** 소스별 통계를 실행 전체 합계로 접는다. 대시보드 상단 요약 카드가 쓴다. */
export interface IngestRunTotals {
  fetched: number;
  stored: number;
  filtered: number;
  extractionFailed: number;
}

export function totals(sources: readonly IngestRunSourceStat[]): IngestRunTotals {
  return sources.reduce(
    (acc, s) => ({
      fetched: acc.fetched + s.fetched,
      stored: acc.stored + s.stored,
      filtered: acc.filtered + s.filtered,
      extractionFailed: acc.extractionFailed + s.extractionFailed,
    }),
    { fetched: 0, stored: 0, filtered: 0, extractionFailed: 0 },
  );
}
