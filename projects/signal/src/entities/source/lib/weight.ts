import { SOURCES, UNKNOWN_SOURCE_WEIGHT } from "../model/sources";
import type { Source } from "../model/types";

/**
 * 소스 weight 조회 — ingestion-ranking INV-R4 강제 지점.
 *
 * 조회 시점에 설정을 읽는다는 게 핵심이다. 항목에 값을 복사해 두면 설정 변경이
 * 다음 조회에 반영되지 않는다.
 */

export type SourceWeightLookup = (sourceId: string) => number;

/** 주어진 소스 목록으로 조회 함수를 만든다. 테스트와 다른 설정 주입에 쓴다. */
export function sourceWeightLookup(
  sources: readonly Source[],
): SourceWeightLookup {
  const byId = new Map(sources.map((s) => [s.id, s.weight]));
  return (sourceId) => byId.get(sourceId) ?? UNKNOWN_SOURCE_WEIGHT;
}

/**
 * 기본 설정(SOURCES)으로 weight 를 읽는다.
 *
 * 모르는 소스에 0 을 주지 않는 이유: 0 을 곱하면 점수가 0 이 되어 그 소스의 글이
 * 피드에서 사실상 사라진다. 소스 id 오타 하나가 "글이 안 보인다"로 나타나면 원인을 못 찾는다.
 * 기본 배수를 주면 순위만 평범해지고 글은 보인다.
 */
export const getSourceWeight: SourceWeightLookup = sourceWeightLookup(SOURCES);
