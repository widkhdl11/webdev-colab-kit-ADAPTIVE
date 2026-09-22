import { computeIssueScore, computeScore, markTrending, TRENDING_TOP_N } from "@/entities/article";
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
export type Ranked<T> = Omit<T, "score" | "isTrending" | "issueScore"> & {
  score: number;
  isTrending: boolean;
  issueScore: number;
};

export function rankFeed<T extends RankableRow>(params: {
  items: readonly T[];
  now: Date;
  weightOf: SourceWeightLookup;
  topN?: number;
  /** 전체를 받지 못한 날짜 키. 그 그룹에는 '뜨는 중'을 안 붙인다 (INV-R5). */
  excludeTrendingDays?: readonly string[];
}): Ranked<T>[] {
  const { items, now, weightOf, topN = TRENDING_TOP_N, excludeTrendingDays = [] } = params;

  const scored = items.map((item) => ({
    ...item,
    // weight 를 항목에 남기지 않는다 — 점수만 남긴다(INV-R4: 스냅샷 금지).
    score: computeScore({
      publishedAt: item.publishedAt,
      now,
      weight: weightOf(item.sourceId),
    }),
    // **이슈성도 여기서 계산한다** (hot-issue.md INV-N3 · H2). 저장하지 않는 것은 점수와
    // 같은 이유다 — 시간감쇠가 든 파생값이라 저장하면 낡는다.
    //
    // 지금은 `score` 와 값이 같다(교차 발행처 수가 항상 1). 그래도 따로 계산하는 것이
    // 요점이다: 같은 사건 묶기가 붙는 날 이 줄만 바뀌고 핫이슈 순서가 따라 바뀐다.
    // 2026-09-21 까지는 이 함수를 **아무도 안 불렀고**, 그래서 그날이 와도 아무 일이
    // 안 일어나는 상태였다.
    issueScore: computeIssueScore({
      crossPublisherCount: 1, // 같은 사건 묶기가 붙기 전까지 항상 1 (INV-N3)
      weight: weightOf(item.sourceId),
      publishedAt: item.publishedAt,
      now,
    }),
  }));

  // 필터가 걸리기 전 전체 목록으로 판정한다(INV-R5).
  return markTrending(scored, topN, excludeTrendingDays) as Ranked<T>[];
}
