import { compareForRanking, computeScore } from "@/entities/article";
import type { SourceWeightLookup } from "@/entities/source";

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
  /** 한 소스가 가져갈 수 있는 최대 칸수. 0 이하면 상한 없음 — **기본이 상한 없음이다**(INV-CB11). */
  perSourceLimit?: number;
}): string[] {
  const { pool, now, weightOf, limit, perSourceLimit = 0 } = params;
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

/**
 * 풀을 **전부** 점수순으로 돌려준다 (INV-CB11).
 *
 * `pickEnrichTargets` 를 직접 부르지 않고 이 이름을 따로 두는 이유: 부르는 자리가
 * `api/ports.ts` 안인데 그 파일은 `server-only` 라 유닛 테스트가 한 번도 로드하지 않는다.
 * 거기에 숫자를 적어 두면 **10 으로 바꿔도 전부 green 이다** — 2026-09-23 변이 확인에서
 * 실제로 그랬고, `ENRICH_POOL` 을 100→10 으로 바꿔도 450개가 green 이던 자리와 같다.
 *
 * 그래서 "몇 건"이라는 판단 자체를 여기로 꺼내 이름으로 고정한다. 부르는 자리에는
 * 고를 숫자가 남지 않는다.
 */
export function orderWholeEnrichPool(params: {
  pool: readonly EnrichPoolRow[];
  now: Date;
  weightOf: SourceWeightLookup;
}): string[] {
  const { pool, now, weightOf } = params;
  // 자르지 않는다. 정렬만 한다 — 시간이 모자라 끊길 때 뒤에 남는 것이 점수 낮은 쪽이 되게.
  return pickEnrichTargets({ pool, now, weightOf, limit: pool.length, perSourceLimit: 0 });
}
