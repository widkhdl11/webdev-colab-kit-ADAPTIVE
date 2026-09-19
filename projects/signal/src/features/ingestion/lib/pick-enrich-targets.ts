import { compareForRanking, computeScore } from "@/entities/article";
import type { SourceWeightLookup } from "@/entities/source";
import { PER_SOURCE_ENRICH_LIMIT } from "./budgets";

/**
 * 이번 주기에 **어느 항목을 요약할지** 고른다.
 *
 * 왜 필요한가 (2026-08-13 실행이 드러낸 것): 후보를 발행시각 내림차순으로만 뽑고 있었다.
 * 그랬더니 자주 올리는 매체 하나(AI타임스)가 그 주기의 요약 10칸을 **전부** 가져갔고,
 * 같은 날 나온 OpenAI·DeepMind 공식 발표는 한 건도 요약되지 않았다.
 * 하루 유입이 요약 예산보다 훨씬 크므로(약 150건 대 10건) "무엇을 먼저 요약하나"가
 * 곧 "무엇이 화면에서 읽을 수 있는 글이 되나"다.
 *
 * 고르는 기준은 **피드가 쓰는 점수와 같다** (ingestion-ranking INV-R2: 시간감쇠 × 소스 weight).
 * 정렬 규칙도 피드와 같은 것을 쓴다(`compareForRanking`, INV-R3). 다른 기준을 쓰면
 * 상위에 뜨는 글과 요약이 붙는 글이 어긋나 — 제일 잘 보이는 자리가 제목만 있는 카드가 된다.
 *
 * **점수순만으로는 부족하다** (2026-08-13 리뷰): 자주 올리고 weight 도 높은 소스는 그날
 * 신규분만으로 예산을 채운다. 축만 바뀌었지 한 소스가 다 먹는 것은 그대로다. 그래서
 * 소스당 상한을 같이 건다 — 상한에 걸려 남은 칸은 다시 점수순으로 채워 예산을 버리지 않는다.
 *
 * 점수를 저장하지 않는다(INV-R1). 여기서도 계산해 쓰고 버린다.
 */
export interface EnrichPoolRow {
  id: string;
  publishedAt: string;
  sourceId: string;
}

export function pickEnrichTargets(params: {
  pool: readonly EnrichPoolRow[];
  now: Date;
  weightOf: SourceWeightLookup;
  limit: number;
  /** 한 소스가 가져갈 수 있는 최대 칸수. 0 이하면 상한 없음. */
  perSourceLimit?: number;
}): string[] {
  const { pool, now, weightOf, limit, perSourceLimit = PER_SOURCE_ENRICH_LIMIT } = params;
  if (limit <= 0) return [];

  const ranked = pool
    .map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      publishedAt: row.publishedAt,
      score: computeScore({
        publishedAt: row.publishedAt,
        now,
        weight: weightOf(row.sourceId),
      }),
    }))
    // 입력을 제자리에서 뒤집지 않는다 — map 이 이미 새 배열을 만들었으므로 여기서 정렬해도 안전하다.
    .sort(compareForRanking);

  if (perSourceLimit <= 0) return ranked.slice(0, limit).map((row) => row.id);

  const picked: string[] = [];
  const overflow: string[] = [];
  const takenBySource = new Map<string, number>();

  for (const row of ranked) {
    if (picked.length >= limit) break;
    const taken = takenBySource.get(row.sourceId) ?? 0;
    if (taken >= perSourceLimit) {
      // 버리지 않고 남겨 둔다 — 소스가 하나뿐인 날 예산을 그냥 버리게 되기 때문이다.
      overflow.push(row.id);
      continue;
    }
    takenBySource.set(row.sourceId, taken + 1);
    picked.push(row.id);
  }

  // 상한 때문에 칸이 남았으면 점수순으로 채운다. overflow 는 이미 점수순이다.
  for (const id of overflow) {
    if (picked.length >= limit) break;
    picked.push(id);
  }

  return picked;
}
