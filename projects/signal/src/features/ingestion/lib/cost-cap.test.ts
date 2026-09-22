import { describe, expect, it } from "vitest";
import type { IngestRunRecord, IngestRunUsage } from "@/entities/ingest-run";
import { DAILY_COST_CAP_USD } from "./budgets";
import { createCostMeter, todaySpendUsd } from "./cost-cap";

/**
 * 하루 요금 상한 — ingest-chaining-budget INV-CB6~CB8.
 *
 * 여기서 붙드는 위험은 **상한이 있는데 안 걸리는 것**이다. 쓴 돈을 잘못된 자리에서 세면
 * 숫자는 늘 0 근처라 정상으로 보이고, 청구서로만 드러난다.
 */

const EMPTY_USAGE: IngestRunUsage = {
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
  hotIssueCalls: null,
  hotIssueInputTokens: null,
  hotIssueOutputTokens: null,
  keywordCalls: null,
  keywordInputTokens: null,
  keywordOutputTokens: null,
  models: null,
};

/**
 * 요약 단계에서 `usd` 달러어치를 쓴 실행 하나.
 *
 * 옛 실행과 같은 모델(`claude-sonnet-5`, 출력 $10/MTok)로 계산해 역산한다 —
 * 단가표를 여기 베껴 쓰면 단가가 바뀌는 날 테스트가 혼자 옛 값을 붙들고 있게 된다.
 */
function runSpending(usd: number, startedAt: string): IngestRunRecord {
  return {
    id: `run-${startedAt}-${usd}`,
    startedAt,
    elapsedMs: 1000,
    budget: {
      exhausted: false,
      skippedSources: [],
      skippedTopicChecks: 0,
      skippedExtractions: 0,
      skippedEnrichments: 0,
      skippedKeywords: null,
      skippedHotIssue: null,
    },
    usage: { ...EMPTY_USAGE, outputTokens: (usd / 10) * 1_000_000 },
    cost: null,
    sources: [],
  };
}

describe("INV-CB6: 오늘 쓴 비용은 오늘 저장된 실행 기록을 합산해서 센다", () => {
  const now = new Date("2026-09-22T05:00:00.000Z"); // KST 14:00

  it("오늘 실행 셋의 합이 나온다", () => {
    const runs = [
      runSpending(1, "2026-09-22T00:10:00.000Z"),
      runSpending(2, "2026-09-22T02:10:00.000Z"),
      runSpending(3, "2026-09-22T04:10:00.000Z"),
    ];
    expect(todaySpendUsd(runs, now)).toBeCloseTo(6, 6);
  });

  it("실패경로: 어제 기록의 큰 금액은 안 들어간다 (한국 시간 날짜 기준)", () => {
    // KST 로 21일 23:00 = UTC 21일 14:00. 오늘(22일)이 아니다.
    const yesterday = runSpending(100, "2026-09-21T14:00:00.000Z");
    const today = runSpending(2, "2026-09-22T02:00:00.000Z");
    expect(todaySpendUsd([yesterday, today], now)).toBeCloseTo(2, 6);
  });

  it("실패경로: 날짜 경계는 KST 자정이다 — UTC 자정으로 가르면 아홉 시간이 어긋난다", () => {
    // UTC 21일 16:00 = KST 22일 01:00 → **오늘**이다. UTC 기준으로 세면 빠진다.
    const earlyToday = runSpending(4, "2026-09-21T16:00:00.000Z");
    expect(todaySpendUsd([earlyToday], now)).toBeCloseTo(4, 6);
    // UTC 22일 14:30 = KST 23일 → **내일**이다. UTC 기준으로 세면 들어간다.
    const tomorrow = runSpending(7, "2026-09-22T15:30:00.000Z");
    expect(todaySpendUsd([tomorrow], now)).toBeCloseTo(0, 6);
  });

  it("기록이 없으면 0 이다 — 0 은 '안 썼다'지 '모른다'가 아니다", () => {
    expect(todaySpendUsd([], now)).toBe(0);
  });
});

describe("INV-CB7·CB8: 상한 판정", () => {
  it("이번 바퀴가 쓴 돈도 같이 센다 — 저장은 바퀴 끝에나 되기 때문이다", () => {
    const meter = createCostMeter({ baseUsd: 0, capUsd: 1 });
    expect(meter.capped()).toBe(false);
    // 출력 1,000,000 토큰 × $10/MTok = $10 → 상한을 넘는다.
    meter.add("claude-sonnet-5", 0, 1_000_000);
    expect(meter.spentUsd()).toBeCloseTo(10, 6);
    expect(meter.capped()).toBe(true);
  });

  it("실패경로: 이번 바퀴 지출을 안 세면 한 호출이 상한을 통째로 넘길 수 있다", () => {
    // 저장된 오늘 합계가 0 이어도, 이 바퀴에서 이미 상한을 넘겼으면 멈춰야 한다.
    const meter = createCostMeter({ baseUsd: 0, capUsd: 5 });
    meter.add("claude-sonnet-5", 0, 600_000); // $6
    expect(meter.capped()).toBe(true);
  });

  it("저장된 오늘 합계가 이미 상한이면 처음부터 걸린다 (INV-CB7: 부르기 전에 본다)", () => {
    const meter = createCostMeter({ baseUsd: DAILY_COST_CAP_USD, capUsd: DAILY_COST_CAP_USD });
    expect(meter.capped()).toBe(true);
    // 한 번도 안 불렀는데 걸려야 한다 — 다 쓰고 나서 확인하면 상한은
    // "얼마나 넘었는지 알려주는 값"이 된다.
    expect(meter.spentUsd()).toBeCloseTo(DAILY_COST_CAP_USD, 6);
  });

  it("상한 아래면 안 걸린다 — 글이 몰린 날에 걸리면 화면이 조용히 얇아진다", () => {
    const meter = createCostMeter({ baseUsd: 2.19, capUsd: DAILY_COST_CAP_USD });
    // 평소의 두 배로 몰린 날($2.19)에 한 바퀴를 더 돌려도 안 걸린다.
    meter.add("claude-sonnet-5", 100_000, 20_000);
    expect(meter.capped()).toBe(false);
  });

  it("기본 상한은 budgets.ts 의 값이다 — 부르는 쪽마다 다른 수를 들고 있으면 안 된다", () => {
    const meter = createCostMeter({ baseUsd: DAILY_COST_CAP_USD - 0.01 });
    expect(meter.capped()).toBe(false);
    meter.add("claude-sonnet-5", 0, 2_000); // $0.02
    expect(meter.capped()).toBe(true);
  });

  it("모델마다 단가가 다르다 — 싼 모델로 같은 토큰을 쓰면 덜 걸린다", () => {
    const sonnet = createCostMeter({ baseUsd: 0, capUsd: 1 });
    const haiku = createCostMeter({ baseUsd: 0, capUsd: 1 });
    sonnet.add("claude-sonnet-5", 0, 150_000);
    haiku.add("claude-haiku-4-5", 0, 150_000);
    expect(sonnet.spentUsd()).toBeGreaterThan(haiku.spentUsd());
  });
});
