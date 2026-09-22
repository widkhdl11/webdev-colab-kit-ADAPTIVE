import { describe, expect, it } from "vitest";
import type { IngestRunUsage } from "../model/types";
import { estimateCostBreakdown, estimateCostUsd, ratesFor } from "./estimate-cost";

const NO_USAGE = {
  calls: 0,
  topicCalls: 0,
  topicInputTokens: 0,
  topicOutputTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  maxInputTokens: 0,
  // 요금 계산은 시간을 안 본다. 칸만 채운다 — 없으면 타입이 안 맞는다.
  stageMs: null,
  hotIssueCalls: 0,
  hotIssueInputTokens: 0,
  hotIssueOutputTokens: 0,
  keywordCalls: 0,
  keywordInputTokens: 0,
  keywordOutputTokens: 0,
  // 모델 기록이 없는 **옛 실행**을 기본값으로 둔다 — 아래 기존 항목들이 전부
  // "그때는 전부 한 모델" 이라는 전제로 쓰여 있다. 모델별 계산은 아래에 따로 본다.
  models: null,
};

/** 프로모션가가 살아 있던 시각 / 정가로 넘어간 뒤의 시각. */
const PROMO_RUN = "2026-08-31T12:00:00.000Z";
const STANDARD_RUN = "2026-09-01T12:00:00.000Z";

/** 사용량과 시각은 **한 실행에서만** 온다 — 함수가 한 덩어리로 받는 이유가 그것이다. */
const run = (usage: typeof NO_USAGE, startedAt: string) => ({ usage, startedAt });

describe("ratesFor — 값 못 박기 (2026-08-31 확인)", () => {
  it("프로모션가는 입력 $2.00 · 출력 $10.00", () => {
    expect(ratesFor(PROMO_RUN)).toEqual({
      tier: "promo",
      inputPerMTokUsd: 2.0,
      outputPerMTokUsd: 10.0,
    });
  });

  it("정가는 입력 $2.00 · 출력 $10.00 (2026-09-22 정정 — 그전엔 이전 세대 단가였다)", () => {
    expect(ratesFor(STANDARD_RUN)).toEqual({
      tier: "standard",
      inputPerMTokUsd: 2.0,
      outputPerMTokUsd: 10.0,
    });
  });
});

describe("ratesFor — 경계", () => {
  it("2026-09-01 UTC 자정 직전은 아직 프로모션가", () => {
    expect(ratesFor("2026-08-31T23:59:59.999Z").inputPerMTokUsd).toBe(2.0);
  });

  it("2026-09-01 UTC 자정부터 정가", () => {
    expect(ratesFor("2026-09-01T00:00:00.000Z").inputPerMTokUsd).toBe(2.0);
  });

  it("읽을 수 없는 시각이면 정가로 — 싼 쪽으로 틀리지 않는다", () => {
    expect(ratesFor("어제").inputPerMTokUsd).toBe(2.0);
    expect(ratesFor("").inputPerMTokUsd).toBe(2.0);
  });

  // `Date.parse` 는 오프셋 없는 문자열을 로컬 시간으로 읽는다(ES 규정). KST 에서
  // `"2026-09-01T00:00:00"` 은 `2026-08-31T15:00Z` 가 되어 **정가여야 할 실행이 프로모션가**로
  // 계산되고, NaN 이 아니라 위의 폴백에도 안 걸린다. 이 테스트는 그 조용한 오차를 붙든다.
  it("시간대를 안 밝힌 시각도 정가로 — 로컬 시간으로 읽혀 경계가 밀리는 것을 막는다", () => {
    expect(ratesFor("2026-09-01T00:00:00").inputPerMTokUsd).toBe(2.0);
    expect(ratesFor("2026-08-31T12:00:00").inputPerMTokUsd).toBe(2.0);
  });

  it("오프셋이 붙어 있으면 그대로 읽는다 — Z 가 아닌 표기도 포함", () => {
    // KST 자정 = 전날 15:00Z → 아직 프로모션가
    expect(ratesFor("2026-09-01T00:00:00+09:00").inputPerMTokUsd).toBe(2.0);
    // 같은 순간을 오프셋 없이 적으면 위 테스트대로 정가로 떨어진다 — 둘이 갈리는 것이 요점이다
    expect(ratesFor("2026-09-01T08:59:59-05:00").inputPerMTokUsd).toBe(2.0);
  });
});

describe("estimateCostUsd", () => {
  it("입력·출력 토큰을 각각의 단가로 환산해 더한다", () => {
    // 프로모션가: 1,000,000 입력 * $2.00 + 500,000 출력 * $10.00 = $2 + $5 = $7
    const cost = estimateCostUsd(
      run({ ...NO_USAGE, inputTokens: 1_000_000, outputTokens: 500_000 }, PROMO_RUN),
    );
    expect(cost).toBeCloseTo(7, 5);
  });

  it("두 단가가 지금은 같은 값이다 — 2026-09-22 정정 뒤의 상태다", () => {
    // 정가: 1,000,000 입력 * $2.00 + 500,000 출력 * $10.00 = $2 + $5 = $7
    const usage = { ...NO_USAGE, inputTokens: 1_000_000, outputTokens: 500_000 };
    expect(estimateCostUsd(run(usage, STANDARD_RUN))).toBeCloseTo(7, 5);
    // 그전에는 "정가가 더 비싸다"를 여기서 못 박고 있었다. 정가 쪽에 **이전 세대 모델의
    // 단가**가 적혀 있었기 때문이고, 그 값으로 화면이 50% 비싸게 표시하고 있었다.
    // 지금은 두 갈래가 같은 값이라 비교로는 아무것도 못 붙든다 — 값 자체를 못 박는다.
    expect(estimateCostUsd(run(usage, PROMO_RUN))).toBeCloseTo(7, 5);
  });

  it("주제판정 토큰과 요약 토큰을 합쳐서 계산한다 (따로 안 남긴다)", () => {
    const cost = estimateCostUsd(
      run({ ...NO_USAGE, topicInputTokens: 500_000, inputTokens: 500_000 }, PROMO_RUN),
    );
    // 합쳐서 1,000,000 입력 * $2.00 = $2
    expect(cost).toBeCloseTo(2, 5);
  });

  it("캐시 쓰기는 입력가의 1.25배로 계산한다", () => {
    const write = estimateCostUsd(run({ ...NO_USAGE, cacheWriteTokens: 1_000_000 }, PROMO_RUN));
    const plain = estimateCostUsd(run({ ...NO_USAGE, inputTokens: 1_000_000 }, PROMO_RUN));
    // 배수를 단가와 무관하게 붙든다 — 단가가 바뀌어도 비율은 그대로여야 한다
    expect(write / plain).toBeCloseTo(1.25, 10);
    const writeStandard = estimateCostUsd(
      run({ ...NO_USAGE, cacheWriteTokens: 1_000_000 }, STANDARD_RUN),
    );
    const plainStandard = estimateCostUsd(
      run({ ...NO_USAGE, inputTokens: 1_000_000 }, STANDARD_RUN),
    );
    expect(writeStandard / plainStandard).toBeCloseTo(1.25, 10);
  });

  it("캐시 읽기는 입력가의 0.1배로 계산한다", () => {
    const read = estimateCostUsd(run({ ...NO_USAGE, cacheReadTokens: 1_000_000 }, PROMO_RUN));
    const plain = estimateCostUsd(run({ ...NO_USAGE, inputTokens: 1_000_000 }, PROMO_RUN));
    expect(read / plain).toBeCloseTo(0.1, 10);
  });

  it("토큰이 하나도 없으면 0이다", () => {
    expect(estimateCostUsd(run(NO_USAGE, PROMO_RUN))).toBe(0);
    expect(estimateCostUsd(run(NO_USAGE, STANDARD_RUN))).toBe(0);
  });
});

describe("estimateCostBreakdown (2026-08-17)", () => {
  it("판정·요약을 나눠서 돌려주되, 둘을 더하면 estimateCostUsd 와 같다", () => {
    const usage = {
      ...NO_USAGE,
      topicInputTokens: 500_000,
      topicOutputTokens: 100_000,
      inputTokens: 200_000,
      outputTokens: 50_000,
      cacheWriteTokens: 10_000,
      cacheReadTokens: 20_000,
    };
    const { topicCostUsd, enrichCostUsd, totalCostUsd } = estimateCostBreakdown(
      run(usage, PROMO_RUN),
    );
    // 판정: 500,000 * $2.00 + 100,000 * $10.00 = $1 + $1 = $2
    expect(topicCostUsd).toBeCloseTo(2, 5);
    expect(totalCostUsd).toBeCloseTo(estimateCostUsd(run(usage, PROMO_RUN)), 10);
    expect(topicCostUsd + enrichCostUsd).toBeCloseTo(totalCostUsd, 10);
  });

  it("판정 비용도 실행 시각의 단가를 따른다", () => {
    const usage = { ...NO_USAGE, topicInputTokens: 500_000, topicOutputTokens: 100_000 };
    // 정가: 500,000 * $2.00 + 100,000 * $10.00 = $1 + $1 = $2
    expect(estimateCostBreakdown(run(usage, STANDARD_RUN)).topicCostUsd).toBeCloseTo(2, 5);
  });

  // 화면이 "프로모션가 기준 / 정가 기준"을 고르는 근거다. 화면이 `startedAt` 으로 다시
  // 판단하면 경계가 두 군데로 갈리므로, **계산에 쓴 단가와 같은 값**이 나와야 한다.
  it("어느 단가를 썼는지 같이 돌려준다 — 금액과 같은 판단에서 나온다", () => {
    const usage = { ...NO_USAGE, inputTokens: 1_000_000 };
    const promo = estimateCostBreakdown(run(usage, PROMO_RUN));
    const standard = estimateCostBreakdown(run(usage, STANDARD_RUN));
    expect(promo.rateTier).toBe("promo");
    expect(standard.rateTier).toBe("standard");
    // 금액 비교로는 라벨을 못 붙든다 — 두 단가가 지금 같은 값이기 때문이다(2026-09-22).
    // 그래서 라벨이 **시각에서 나온다**는 것만 본다. 단가가 다시 갈리면 금액 비교를 되살린다.
    expect(promo.totalCostUsd).toBeCloseTo(standard.totalCostUsd, 5);
  });

  it("읽을 수 없는 시각은 정가로 계산하고 라벨도 정가로 말한다", () => {
    expect(estimateCostBreakdown(run(NO_USAGE, "어제")).rateTier).toBe("standard");
    expect(estimateCostBreakdown(run(NO_USAGE, "2026-08-31T12:00:00")).rateTier).toBe("standard");
  });

  it("캐시 비용은 요약 쪽에 몰아 둔다 — 판정 쪽엔 안 남는다", () => {
    const { topicCostUsd, enrichCostUsd } = estimateCostBreakdown(
      run({ ...NO_USAGE, cacheWriteTokens: 1_000_000 }, PROMO_RUN),
    );
    expect(topicCostUsd).toBe(0);
    expect(enrichCostUsd).toBeCloseTo(2.5, 5);
  });
});

/**
 * 모델별 단가 (2026-09-22). 단계마다 다른 모델을 쓰기 시작하면서 생겼다.
 *
 * 여기서 붙드는 것: **실행이 기록한 모델로 계산한다.** 코드의 지금 값으로 계산하면
 * 모델을 바꾼 날 과거 요금이 소급해서 바뀌고, "바꾸고 얼마나 줄었나"를 못 본다.
 */
describe("모델별 단가", () => {
  const withModels = (models: IngestRunUsage["models"]) => ({
    usage: { ...NO_USAGE, topicInputTokens: 1_000_000, topicOutputTokens: 100_000, models },
    startedAt: STANDARD_RUN,
  });

  it("haiku 는 sonnet 의 절반이다", () => {
    const sonnet = estimateCostBreakdown(
      withModels({ topic: "claude-sonnet-5", hotIssue: "x", enrich: "x", keywords: "x" }),
    ).topicCostUsd;
    const haiku = estimateCostBreakdown(
      withModels({ topic: "claude-haiku-4-5", hotIssue: "x", enrich: "x", keywords: "x" }),
    ).topicCostUsd;
    // sonnet: 1,000,000 * $2 + 100,000 * $10 = $2 + $1 = $3
    expect(sonnet).toBeCloseTo(3, 5);
    expect(haiku).toBeCloseTo(1.5, 5);
  });

  it("모르는 모델은 **제일 비싼 단가**로 본다 — 싼 쪽으로 틀리면 화면이 안심시킨다", () => {
    const unknown = estimateCostBreakdown(
      withModels({ topic: "claude-미래-9", hotIssue: "x", enrich: "x", keywords: "x" }),
    ).topicCostUsd;
    expect(unknown).toBeCloseTo(3, 5);
  });

  it("모델 기록이 없는 옛 실행은 그때 쓰던 모델로 본다", () => {
    // null 을 지금 코드의 상수로 채우면, 모델을 바꾸는 순간 과거 요금이 따라 움직인다.
    expect(estimateCostBreakdown(withModels(null)).topicCostUsd).toBeCloseTo(3, 5);
  });

  it("단계마다 자기 모델로 계산한다 — 한 값으로 뭉치지 않는다", () => {
    const b = estimateCostBreakdown({
      usage: {
        ...NO_USAGE,
        topicInputTokens: 1_000_000,
        hotIssueInputTokens: 1_000_000,
        keywordInputTokens: 1_000_000,
        inputTokens: 1_000_000,
        models: {
          topic: "claude-haiku-4-5",
          hotIssue: "claude-sonnet-5",
          enrich: "claude-sonnet-5",
          keywords: "claude-haiku-4-5",
        },
      },
      startedAt: STANDARD_RUN,
    });
    expect(b.topicCostUsd).toBeCloseTo(1, 5);
    expect(b.keywordCostUsd).toBeCloseTo(1, 5);
    expect(b.hotIssueCostUsd).toBeCloseTo(2, 5);
    expect(b.enrichCostUsd).toBeCloseTo(2, 5);
    expect(b.totalCostUsd).toBeCloseTo(6, 5);
  });
});
