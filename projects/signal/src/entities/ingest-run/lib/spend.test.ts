import { describe, expect, it } from "vitest";
import type { IngestRunRecord } from "../model/types";
import { summarizeSpend } from "./spend";

const NO_USAGE: IngestRunRecord["usage"] = {
  calls: 0,
  topicCalls: 0,
  topicInputTokens: 0,
  topicOutputTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  maxInputTokens: 0,
  stageMs: null,
  hotIssueCalls: 0,
  hotIssueInputTokens: 0,
  hotIssueOutputTokens: 0,
  keywordCalls: 0,
  keywordInputTokens: 0,
  keywordOutputTokens: 0,
  models: {
    topic: "claude-haiku-4-5",
    hotIssue: "claude-sonnet-5",
    enrich: "claude-sonnet-5",
    keywords: "claude-haiku-4-5",
  },
};

/** 입력 1,000,000 토큰짜리 실행 하나. 단가에 따라 $1(haiku) 또는 $2(sonnet) 가 된다. */
const run = (startedAt: string, over: Partial<IngestRunRecord["usage"]> = {}): IngestRunRecord => ({
  id: startedAt,
  startedAt,
  elapsedMs: 1000,
  // 요금 상한이 생기기 전의 실행도 합계에 들어간다 — 그 칸은 null 이다.
  cost: null,
  budget: {
    exhausted: false,
    skippedSources: [],
    skippedTopicChecks: 0,
    skippedExtractions: 0,
    skippedEnrichments: 0,
    skippedKeywords: null,
    skippedHotIssue: null,
  },
  usage: { ...NO_USAGE, ...over },
  sources: [],
});

const NOW = new Date("2026-09-22T10:00:00+09:00");

describe("요금 합계", () => {
  it("하루에 여러 번 돌면 그날 요금은 그 합이다", () => {
    // 화면이 최신 실행 하나만 보여주던 동안 알 수 없던 값이 이것이다.
    const runs = [
      run("2026-09-22T01:00:00+09:00", { inputTokens: 1_000_000 }),
      run("2026-09-22T09:00:00+09:00", { inputTokens: 1_000_000 }),
    ];
    const s = summarizeSpend(runs, NOW);
    expect(s.todayRuns).toBe(2);
    expect(s.today.enrichUsd).toBeCloseTo(4, 5); // sonnet $2/MTok × 2회
  });

  it("어제 실행은 오늘 합계에 안 들어간다 — 날짜는 한국 시간으로 가른다", () => {
    const runs = [
      run("2026-09-22T00:30:00+09:00", { inputTokens: 1_000_000 }),
      run("2026-09-21T23:30:00+09:00", { inputTokens: 1_000_000 }),
    ];
    const s = summarizeSpend(runs, NOW);
    expect(s.todayRuns).toBe(1);
    expect(s.today.enrichUsd).toBeCloseTo(2, 5);
  });

  it("단계마다 따로 센다 — 어디서 줄일지는 이 나눔에서 나온다", () => {
    const s = summarizeSpend(
      [
        run("2026-09-22T09:00:00+09:00", {
          topicInputTokens: 1_000_000, // haiku → $1
          hotIssueInputTokens: 1_000_000, // sonnet → $2
          inputTokens: 1_000_000, // sonnet → $2
          keywordInputTokens: 1_000_000, // haiku → $1
        }),
      ],
      NOW,
    );
    expect(s.today.topicUsd).toBeCloseTo(1, 5);
    expect(s.today.hotIssueUsd).toBeCloseTo(2, 5);
    expect(s.today.enrichUsd).toBeCloseTo(2, 5);
    expect(s.today.keywordUsd).toBeCloseTo(1, 5);
    expect(s.today.totalUsd).toBeCloseTo(6, 5);
  });

  it("하루 평균은 **기록이 있는 날 수**로만 나눈다", () => {
    // 기록이 없는 날을 0 으로 세면 평균이 낮아지고, 그 값 × 30 은 요금을 적게 말한다.
    const runs = [
      run("2026-09-22T09:00:00+09:00", { inputTokens: 1_000_000 }), // $2
      run("2026-09-20T09:00:00+09:00", { inputTokens: 2_000_000 }), // $4
      // 09-21 은 기록이 없다. 사흘로 나누면 $2, 이틀로 나누면 $3 이다.
    ];
    const s = summarizeSpend(runs, NOW);
    expect(s.daysCounted).toBe(2);
    expect(s.dailyAverageUsd).toBeCloseTo(3, 5);
    expect(s.monthlyEstimateUsd).toBeCloseTo(90, 5);
  });

  it("기록이 아예 없으면 전부 0 이고 건수도 0 이다", () => {
    const s = summarizeSpend([], NOW);
    expect(s.todayRuns).toBe(0);
    expect(s.today.totalUsd).toBe(0);
    expect(s.daysCounted).toBe(0);
    expect(s.monthlyEstimateUsd).toBe(0);
  });

  it("옛 실행(모델 기록 없음)도 합계에 들어간다 — 그때 쓰던 모델 단가로", () => {
    const s = summarizeSpend(
      [run("2026-09-22T09:00:00+09:00", { models: null, topicInputTokens: 1_000_000 })],
      NOW,
    );
    // 옛 실행은 전부 sonnet 이었다 → $2. haiku 로 보면 $1 이 되어 과거가 싸 보인다.
    expect(s.today.topicUsd).toBeCloseTo(2, 5);
  });
});
