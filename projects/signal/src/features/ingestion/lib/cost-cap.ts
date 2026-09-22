import { stageCostUsd, summarizeSpend } from "@/entities/ingest-run";
import type { IngestRunRecord } from "@/entities/ingest-run";
import { DAILY_COST_CAP_USD } from "./budgets";

/**
 * 하루 요금 상한 — ingest-chaining-budget INV-CB6~CB8.
 *
 * 상한은 **하루 할당량이 아니라 비정상을 끊는 장치**다(2026-09-22 사용자 결정).
 * 글이 몰린 날에는 걸리지 않아야 하고, 걸렸다면 그건 뭔가 잘못됐다는 뜻이다.
 */

/**
 * 오늘(한국 시간) 저장된 실행 기록의 요금 합계 (INV-CB6).
 *
 * **호출과 호출 사이에 숫자를 넘겨받지 않는다.** 넘겨받은 숫자는 체인이 한 번 끊기면
 * 0 부터 다시 시작하고, 그러면 상한이 있는데도 하루에 몇 번이고 상한만큼 쓸 수 있다.
 *
 * "오늘"을 한국 시간으로 가르는 이유: 사람이 그렇게 센다. 실행 환경의 시간대로 세면
 * 하루가 다른 시각에 바뀌고, 그 차이는 청구서로만 드러난다. 날짜 판정은
 * `summarizeSpend` 가 이미 KST 로 하고 있어 그것을 쓴다 — 여기서 다시 가르면
 * 두 자리가 갈리는 날이 온다.
 */
export function todaySpendUsd(runs: readonly IngestRunRecord[], now: Date): number {
  return summarizeSpend(runs, now).today.totalUsd;
}

/**
 * 지금까지 얼마 썼는지를 들고 다니며 상한에 닿았는지 답하는 것.
 *
 * 저장된 오늘 합계(`baseUsd`)에 **이번 바퀴가 쓰는 돈을 더해 간다.** 이번 바퀴 지출을
 * 안 세면 한 호출이 상한을 통째로 넘길 수 있다 — 리포트는 바퀴가 끝나야 저장되므로
 * 저장된 합계는 이 바퀴가 시작할 때의 값에서 멈춰 있다.
 */
export interface CostMeter {
  /** 저장된 오늘 합계 + 이번 바퀴가 지금까지 쓴 돈. */
  spentUsd(): number;
  /** 상한에 닿았는가 (INV-CB7 — 모델을 부르기 **전에** 묻는 값이다). */
  capped(): boolean;
  /** 호출 한 번이 쓴 토큰을 더한다. 실패한 호출도 더한다 — 실패해도 요금은 나갔다. */
  add(model: string, inputTokens: number, outputTokens: number): void;
  /** 상한 금액 자체. 리포트에 같이 남긴다 — 값을 바꾼 날 옛 리포트가 따라 움직이면 안 된다. */
  capUsd: number;
}

export function createCostMeter(input: { baseUsd: number; capUsd?: number }): CostMeter {
  const capUsd = input.capUsd ?? DAILY_COST_CAP_USD;
  // 기록 조회가 이상한 값을 돌려줘도(NaN·음수) 상한이 무력화되지 않게 바닥을 둔다.
  const base = Number.isFinite(input.baseUsd) && input.baseUsd > 0 ? input.baseUsd : 0;
  let runUsd = 0;

  return {
    capUsd,
    spentUsd: () => base + runUsd,
    capped: () => base + runUsd >= capUsd,
    add: (model, inputTokens, outputTokens) => {
      runUsd += stageCostUsd(model, inputTokens, outputTokens);
    },
  };
}
