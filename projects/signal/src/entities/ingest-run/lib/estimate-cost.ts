import type { IngestRunRecord } from "../model/types";

/**
 * claude-sonnet-5 요금(per-MTok, USD). 토큰 수만으로는 비용이 가늠이 안 된다는 사용자 요청으로 추가.
 *
 * **지금 금액은 이 값이 아니라 아래 `MODEL_RATES`(모델별 단가)로 계산한다** (2026-09-22 부터 단계마다
 * 모델이 다르다). 이 두 값은 실행 시각으로 단가 구분(프로모션/정가)을 고르는 데 남아 있다.
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
/**
 * **2026-09-22 정정: 3.0/15.0 → 2.0/10.0.**
 *
 * 앤트로픽 공식 요금표의 `claude-sonnet-5` 단가는 입력 $2.00 · 출력 $10.00 이다.
 * 여기 적혀 있던 3.0/15.0 은 **이전 세대(Sonnet 4.6)의 단가**였고, 그 값으로
 * 화면과 보고서가 실제보다 **50% 비싸게** 표시하고 있었다. 그 숫자를 근거로
 * 하루 상한과 월 예상 요금을 정하려던 참에 드러났다.
 *
 * 공교롭게 아래 프로모션가와 같은 값이 됐다. 그래도 두 갈래를 그대로 두는 이유는,
 * 단가가 바뀔 때 **실행 시각으로 고르는 구조**가 필요하기 때문이다 — 상수 하나를
 * 손으로 갈면 배포 시점을 못 맞춘 실행이 조용히 틀린 값으로 계산된다.
 */
export const STANDARD_RATES = {
  tier: "standard",
  inputPerMTokUsd: 2.0,
  outputPerMTokUsd: 10.0,
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

/**
 * **모델별 단가** (per-MTok, USD). 앤트로픽 공식 요금표 기준, 2026-09-22 확인.
 *
 * 왜 모델별인가: 2026-09-22 부터 단계마다 다른 모델을 쓴다 — 제목 한 줄을 가르는 일과
 * 사람이 읽을 요약을 쓰는 일에 같은 모델을 쓸 이유가 없다. 단가가 두 배 차이라
 * 한 값으로 계산하면 화면의 금액이 실제와 갈린다.
 */
export const MODEL_RATES: Record<string, { inputPerMTokUsd: number; outputPerMTokUsd: number }> = {
  "claude-sonnet-5": { inputPerMTokUsd: 2.0, outputPerMTokUsd: 10.0 },
  // 요약 단계 (2026-09-23 사용자 결정). 표에 없으면 제일 비싼 단가로 계산돼 오히려 싸게 보였다.
  "claude-opus-5-5": { inputPerMTokUsd: 4.0, outputPerMTokUsd: 20.0 },
  "claude-haiku-4-5": { inputPerMTokUsd: 1.0, outputPerMTokUsd: 5.0 },
};

/**
 * 모르는 모델 이름이면 **표에서 제일 비싼 단가**로 본다.
 *
 * 싼 쪽으로 틀리면 화면이 "생각보다 안 썼네"로 보이고, 그게 이 화면을 만든 이유를
 * 정면으로 깬다. 비싼 쪽으로 틀리면 사람이 한 번 더 확인하게 된다.
 */
export function ratesForModel(model: string): { inputPerMTokUsd: number; outputPerMTokUsd: number } {
  const known = MODEL_RATES[model];
  if (known) return known;
  const all = Object.values(MODEL_RATES);
  return all.reduce((a, b) => (b.inputPerMTokUsd > a.inputPerMTokUsd ? b : a));
}

/**
 * 모델 하나가 토큰만큼 쓴 요금 (USD).
 *
 * 왜 따로 내보내나: 수집이 도는 **중간에** "지금까지 얼마 썼나"를 물어야 하기 때문이다
 * (ingest-chaining-budget INV-CB7 — 모델을 부르기 전에 확인한다). 그때는 아직 실행 기록이
 * 없어서 `estimateCostBreakdown` 에 넘길 것이 없다. 단가를 고르는 규칙은 하나여야 하므로
 * 여기 있는 것을 쓴다 — 부르는 쪽이 자기 단가표를 들면 화면의 금액과 상한의 금액이 갈린다.
 */
export function stageCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const r = ratesForModel(model);
  return (inputTokens / 1_000_000) * r.inputPerMTokUsd + (outputTokens / 1_000_000) * r.outputPerMTokUsd;
}

/**
 * 모델 기록이 없는 옛 실행이 쓰던 모델 (2026-09-22 이전).
 *
 * 그때는 네 단계가 전부 이 하나였다. 이 값을 지금 코드의 상수로 바꾸면 모델을 바꿀 때마다
 * 과거 요금이 따라 움직인다.
 */
const LEGACY_MODELS = {
  topic: "claude-sonnet-5",
  hotIssue: "claude-sonnet-5",
  enrich: "claude-sonnet-5",
  keywords: "claude-sonnet-5",
} as const;

/** 단계별로 나눈 요금. 화면이 "어디서 줄일까"를 고르는 재료다. */
export interface StageCosts {
  topicCostUsd: number;
  hotIssueCostUsd: number;
  enrichCostUsd: number;
  keywordCostUsd: number;
  totalCostUsd: number;
  rateTier: RateTier;
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
export function estimateCostBreakdown(run: CostInput): StageCosts {
  const { usage, startedAt } = run;
  // 실행이 실제로 쓴 모델로 단가를 고른다. 옛 실행에는 그 기록이 없어서 그때 유일하게
  // 쓰던 모델로 본다 — 지금 코드의 값으로 계산하면 모델을 바꾼 날 **과거 요금이 소급해서
  // 바뀌고**, 화면에서 "바꾸고 얼마나 줄었나"를 볼 수 없게 된다.
  const models = usage.models ?? LEGACY_MODELS;
  const { tier } = ratesFor(startedAt);

  // 계산식은 `stageCostUsd` 하나뿐이다 — 두 벌을 두면 한쪽만 고치는 날 화면의 금액과
  // 상한이 재는 금액이 갈린다.
  const cost = stageCostUsd;

  const topicCostUsd = cost(models.topic, usage.topicInputTokens, usage.topicOutputTokens);
  const hotIssueCostUsd = cost(
    models.hotIssue,
    usage.hotIssueInputTokens ?? 0,
    usage.hotIssueOutputTokens ?? 0,
  );
  const keywordCostUsd = cost(
    models.keywords,
    usage.keywordInputTokens ?? 0,
    usage.keywordOutputTokens ?? 0,
  );

  // 캐시 비용은 어느 단계가 썼는지 usage 에 안 남아 있어 요약 쪽에 몰아 둔다 —
  // 이 프로젝트는 아직 캐싱을 안 쓰므로 지금은 항상 0 이다.
  const enrichRates = ratesForModel(models.enrich);
  const cacheWriteCost =
    (usage.cacheWriteTokens / 1_000_000) * enrichRates.inputPerMTokUsd * CACHE_WRITE_MULTIPLIER;
  const cacheReadCost =
    (usage.cacheReadTokens / 1_000_000) * enrichRates.inputPerMTokUsd * CACHE_READ_MULTIPLIER;
  const enrichCostUsd =
    cost(models.enrich, usage.inputTokens, usage.outputTokens) + cacheWriteCost + cacheReadCost;

  return {
    topicCostUsd,
    hotIssueCostUsd,
    enrichCostUsd,
    keywordCostUsd,
    totalCostUsd: topicCostUsd + hotIssueCostUsd + enrichCostUsd + keywordCostUsd,
    rateTier: tier,
  };
}
