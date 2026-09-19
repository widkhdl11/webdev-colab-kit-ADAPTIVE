import { avgPerItem } from "./avg-per-item";

/**
 * 실행 하나의 "글당 평균 소요시간".
 *
 * 항목 하나하나의 시간을 재는 장치는 없다(2026-08-17 결정) — 전체 소요시간을 전체
 * 검색 글 수로 나눈 근사치다.
 */
export function avgMsPerItem(elapsedMs: number, totalFetched: number): number | null {
  return avgPerItem(elapsedMs, totalFetched);
}
