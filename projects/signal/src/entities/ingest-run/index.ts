// INV-S4: 조회 함수(fetchLatestIngestRun·fetchRunSourceItems)는 여기서 내보내지 않는다.
// secret 키로 읽어서 server-only 표시가 붙어 있는데, 이 배럴은 위젯(클라이언트로 갈 수
// 있는 곳)에서도 import 할 수 있는 자리다 — 여기 실으면 그 표시가 무의미해진다
// (tests/secret-boundary.test.ts 가 붙든다). 서버 전용 자리(app/)만 `./api/dashboard-queries`
// 를 직접 가리켜서 쓴다.
export type {
  IngestRunBudget,
  IngestRunCost,
  IngestRunRecord,
  IngestRunSourceStat,
  IngestRunUsage,
  RunSourceItem,
} from "./model/types";
export { avgMsPerItem } from "./lib/avg-ms-per-item";
export { avgTokensPerItem } from "./lib/avg-tokens-per-item";
export { totals } from "./lib/totals";
export type { IngestRunTotals } from "./lib/totals";
// `estimateCostUsd` 는 배럴에 안 올린다 — 프로덕션 호출자가 없고(위젯은 breakdown 만 쓴다)
// 테스트의 "부분의 합 = 전체" 교차검증용이라, 공개해 두면 다른 화면이 그걸 쓰게 된다.
export { estimateCostBreakdown, stageCostUsd } from "./lib/estimate-cost";
export { summarizeSpend } from "./lib/spend";
export type { SpendSummary, StageSpend } from "./lib/spend";
export { USD_TO_KRW, toKrw } from "./lib/to-krw";
