import { describe, expect, it } from "vitest";
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

  it("정가는 입력 $3.00 · 출력 $15.00", () => {
    expect(ratesFor(STANDARD_RUN)).toEqual({
      tier: "standard",
      inputPerMTokUsd: 3.0,
      outputPerMTokUsd: 15.0,
    });
  });
});

describe("ratesFor — 경계", () => {
  it("2026-09-01 UTC 자정 직전은 아직 프로모션가", () => {
    expect(ratesFor("2026-08-31T23:59:59.999Z").inputPerMTokUsd).toBe(2.0);
  });

  it("2026-09-01 UTC 자정부터 정가", () => {
    expect(ratesFor("2026-09-01T00:00:00.000Z").inputPerMTokUsd).toBe(3.0);
  });

  it("읽을 수 없는 시각이면 정가로 — 싼 쪽으로 틀리지 않는다", () => {
    expect(ratesFor("어제").inputPerMTokUsd).toBe(3.0);
    expect(ratesFor("").inputPerMTokUsd).toBe(3.0);
  });

  // `Date.parse` 는 오프셋 없는 문자열을 로컬 시간으로 읽는다(ES 규정). KST 에서
  // `"2026-09-01T00:00:00"` 은 `2026-08-31T15:00Z` 가 되어 **정가여야 할 실행이 프로모션가**로
  // 계산되고, NaN 이 아니라 위의 폴백에도 안 걸린다. 이 테스트는 그 조용한 오차를 붙든다.
  it("시간대를 안 밝힌 시각도 정가로 — 로컬 시간으로 읽혀 경계가 밀리는 것을 막는다", () => {
    expect(ratesFor("2026-09-01T00:00:00").inputPerMTokUsd).toBe(3.0);
    expect(ratesFor("2026-08-31T12:00:00").inputPerMTokUsd).toBe(3.0);
  });

  it("오프셋이 붙어 있으면 그대로 읽는다 — Z 가 아닌 표기도 포함", () => {
    // KST 자정 = 전날 15:00Z → 아직 프로모션가
    expect(ratesFor("2026-09-01T00:00:00+09:00").inputPerMTokUsd).toBe(2.0);
    // 같은 순간을 오프셋 없이 적으면 위 테스트대로 정가로 떨어진다 — 둘이 갈리는 것이 요점이다
    expect(ratesFor("2026-09-01T08:59:59-05:00").inputPerMTokUsd).toBe(3.0);
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

  it("정가 실행은 같은 토큰이라도 더 비싸다", () => {
    // 정가: 1,000,000 입력 * $3.00 + 500,000 출력 * $15.00 = $3 + $7.5 = $10.5
    const usage = { ...NO_USAGE, inputTokens: 1_000_000, outputTokens: 500_000 };
    expect(estimateCostUsd(run(usage, STANDARD_RUN))).toBeCloseTo(10.5, 5);
    expect(estimateCostUsd(run(usage, STANDARD_RUN))).toBeGreaterThan(
      estimateCostUsd(run(usage, PROMO_RUN)),
    );
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
    // 정가: 500,000 * $3.00 + 100,000 * $15.00 = $1.5 + $1.5 = $3
    expect(estimateCostBreakdown(run(usage, STANDARD_RUN)).topicCostUsd).toBeCloseTo(3, 5);
  });

  // 화면이 "프로모션가 기준 / 정가 기준"을 고르는 근거다. 화면이 `startedAt` 으로 다시
  // 판단하면 경계가 두 군데로 갈리므로, **계산에 쓴 단가와 같은 값**이 나와야 한다.
  it("어느 단가를 썼는지 같이 돌려준다 — 금액과 같은 판단에서 나온다", () => {
    const usage = { ...NO_USAGE, inputTokens: 1_000_000 };
    const promo = estimateCostBreakdown(run(usage, PROMO_RUN));
    const standard = estimateCostBreakdown(run(usage, STANDARD_RUN));
    expect(promo.rateTier).toBe("promo");
    expect(standard.rateTier).toBe("standard");
    // 라벨이 금액과 따로 놀지 않는지 — 같은 토큰인데 promo 가 더 싸야 한다
    expect(promo.totalCostUsd).toBeLessThan(standard.totalCostUsd);
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
