import type { IngestRunRecord } from "../model/types";

/**
 * claude-sonnet-5 요금(per-MTok, USD). 토큰 수만으로는 비용이 가늠이 안 된다는 사용자 요청으로 추가.
 *
 * 단가는 **실행 시각에 따라 갈린다** — 2026-08-31 까지는 프로모션가, 2026-09-01 부터는 정가.
 * 상수 하나를 그날 손으로 바꾸는 방식은 배포 시점을 못 맞추면 그대로 틀린다(일찍 바꾸면 실제보다
 * 비싸게, 늦게 바꾸면 싸게 보여준다). 그래서 상수를 갈지 않고 실행의 `startedAt` 으로 고른다.
 */
export const PROMO_RATES = {
  tier: "promo",
  inputPerMTokUsd: 2.0,
  outputPerMTokUsd: 10.0,
} as const;
export const STANDARD_RATES = {
  tier: "standard",
  inputPerMTokUsd: 3.0,
  outputPerMTokUsd: 15.0,
} as const;

/**
 * 정가가 시작되는 시각.
 *
 * **UTC 자정으로 잡았다 — 이건 추정이다.** 앤트로픽 문서는 종료 날짜(2026-08-31)만 밝히고
 * 시간대를 안 적는다. 안 재본 값이라, 경계 몇 시간 안에 돌린 실행은 단가가 어긋날 수 있다.
 */
export const STANDARD_FROM_MS = Date.UTC(2026, 8, 1);

/** 어느 단가를 썼는지. 화면이 라벨 문구를 고르는 데 쓴다 — 날짜 판단은 UI 로 안 올린다. */
export type RateTier = "promo" | "standard";

interface Rates {
  readonly tier: RateTier;
  readonly inputPerMTokUsd: number;
  readonly outputPerMTokUsd: number;
}

/**
 * 시각 문자열이 시간대를 스스로 밝히고 있는가 (`Z` 또는 `+09:00`/`-0500`).
 *
 * `Date.parse` 는 오프셋이 없는 `"2026-09-01T00:00:00"` 을 **로컬 시간**으로 읽는다(ES 규정).
 * KST 에서 돌리면 `2026-08-31T15:00Z` 가 되어 정가여야 할 실행이 프로모션가로 계산되고,
 * NaN 이 아니라서 아래 폴백에도 안 걸린다 — 조용히 싼 쪽으로 틀린다.
 * 지금 프로덕션 경로는 `started_at timestamptz` + `toISOString()` 이라 항상 오프셋이 붙지만,
 * 인자 타입이 `string` 이라 다른 호출자는 아무 문자열이나 넘길 수 있다. 그 구멍을 여기서 막는다.
 */
const HAS_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * 실행 시각에 맞는 단가를 고른다.
 *
 * 읽을 수 없거나 **시간대를 안 밝힌** 시각이면 정가를 쓴다 — 비싼 쪽으로 틀린다. 싼 쪽으로
 * 틀리면 화면이 "생각보다 안 썼네"로 보이고, 그게 이 화면을 만든 이유(비용을 가늠한다)를
 * 정면으로 깬다.
 */
export function ratesFor(startedAt: string): Rates {
  if (!HAS_TIMEZONE.test(startedAt)) return STANDARD_RATES;
  const ms = Date.parse(startedAt);
  if (Number.isNaN(ms)) return STANDARD_RATES;
  return ms < STANDARD_FROM_MS ? PROMO_RATES : STANDARD_RATES;
}

/** 캐시 쓰기는 입력가의 1.25배, 읽기는 0.1배 (5분 TTL 기준 — 이 프로젝트는 아직 캐싱을 안 쓴다). */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/**
 * 비용 계산에 필요한 실행의 두 필드. **한 덩어리로 받는다** — 사용량과 시각은 항상 같은
 * 실행에서 와야 하는데, 따로 받으면 다른 실행의 사용량 × 이 실행의 시각 조합이 컴파일된다
 * (2026-08-31 리뷰 이관분).
 */
type CostInput = Pick<IngestRunRecord, "usage" | "startedAt">;

/**
 * 실행 하나의 토큰 사용량을 대략적인 USD 로 환산한다.
 *
 * `inputTokens`·`outputTokens` 는 이미 캐시분을 뺀 값이라(usage.ts 문서 참고) 그대로 더한다 —
 * 겹쳐 세지 않는다.
 *
 * `startedAt` 은 단가를 고르는 데 쓴다(위 `ratesFor`).
 */
export function estimateCostUsd(run: CostInput): number {
  return estimateCostBreakdown(run).totalCostUsd;
}

/**
 * 판정(topic)·요약·번역(enrich) 이 각각 얼마를 썼는지 나눠서 돌려준다 — 대시보드가 두 칸을
 * 따로 보여주려고 각자 estimateCostUsd 를 두 번 부르며 가짜 사용량 객체를 만드는 대신
 * 여기서 한 번에 나눈다(2026-08-17 리뷰). 캐시 비용은 어느 단계가 썼는지 usage 에 안 남아
 * 있어 enrich 쪽에 몰아 둔다 — 이 프로젝트는 아직 캐싱을 안 쓰므로 지금은 항상 0.
 */
export function estimateCostBreakdown(run: CostInput): {
  topicCostUsd: number;
  enrichCostUsd: number;
  totalCostUsd: number;
  rateTier: RateTier;
} {
  const { usage, startedAt } = run;
  // 어느 단가를 썼는지 같이 돌려준다 — 화면이 `startedAt` 으로 다시 판단하면 경계가 두
  // 군데로 갈려 조용히 어긋난다 (2026-08-31 리뷰 이관분).
  const { tier, inputPerMTokUsd, outputPerMTokUsd } = ratesFor(startedAt);

  const topicCostUsd =
    (usage.topicInputTokens / 1_000_000) * inputPerMTokUsd +
    (usage.topicOutputTokens / 1_000_000) * outputPerMTokUsd;

  const cacheWriteCost =
    (usage.cacheWriteTokens / 1_000_000) * inputPerMTokUsd * CACHE_WRITE_MULTIPLIER;
  const cacheReadCost =
    (usage.cacheReadTokens / 1_000_000) * inputPerMTokUsd * CACHE_READ_MULTIPLIER;
  const enrichCostUsd =
    (usage.inputTokens / 1_000_000) * inputPerMTokUsd +
    (usage.outputTokens / 1_000_000) * outputPerMTokUsd +
    cacheWriteCost +
    cacheReadCost;

  return { topicCostUsd, enrichCostUsd, totalCostUsd: topicCostUsd + enrichCostUsd, rateTier: tier };
}
