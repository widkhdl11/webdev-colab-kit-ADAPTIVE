import { computeScore, markTrending, TRENDING_TOP_N } from "@/entities/article";
import type { SourceWeightLookup } from "@/entities/source";

/** 랭킹에 필요한 최소 필드. 목록 투영이든 본문까지 있는 항목이든 이것만 있으면 된다. */
export interface RankableRow {
  id: string;
  publishedAt: string;
  sourceId: string;
}

/**
 * 저장된 항목에 랭킹 파생값을 붙인다 — ingestion-ranking INV-R1·R4·R5 의 조립 지점.
 *
 * 여기가 "조회 시점"이다. entities 쪽 계산은 전부 순수 함수라 스스로는 아무것도 안 하고,
 * 이 함수가 **언제**(now) **무슨 weight 로**(weightOf) 부를지를 정한다.
 *
 * 순서가 규칙이다: 점수 → 뜨는 중 → (그 뒤에야) 필터·정렬.
 * 뜨는 중을 필터 뒤로 미루면 같은 글의 뱃지가 필터에 따라 붙었다 떨어진다(INV-R5).
 */
/**
 * 파생값을 붙인 모양.
 *
 * `Omit` 으로 먼저 걷어내는 이유: 저장 모양(`StoredArticle`)은 `score?: never` 로
 * "여긴 값이 없다"를 못 박아 뒀다(INV-R1). 그걸 그대로 교집합하면 `number & never` 가 돼
 * 타입 전체가 `never` 로 무너진다. 붙이는 쪽에서 그 자리를 비우고 새 값을 넣는다.
 */
export type Ranked<T> = Omit<T, "score" | "isTrending"> & {
  score: number;
  isTrending: boolean;
};

export function rankFeed<T extends RankableRow>(params: {
  items: readonly T[];
  now: Date;
  weightOf: SourceWeightLookup;
  topN?: number;
}): Ranked<T>[] {
  const { items, now, weightOf, topN = TRENDING_TOP_N } = params;

  const scored = items.map((item) => ({
    ...item,
    // weight 를 항목에 남기지 않는다 — 점수만 남긴다(INV-R4: 스냅샷 금지).
    score: computeScore({
      publishedAt: item.publishedAt,
      now,
      weight: weightOf(item.sourceId),
    }),
  }));

  // 필터가 걸리기 전 전체 목록으로 판정한다(INV-R5).
  return markTrending(scored, topN) as Ranked<T>[];
}
