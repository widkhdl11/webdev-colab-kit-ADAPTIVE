export { runIngest } from "./lib/run-ingest";
export { INGEST_BUDGET_MS } from "./lib/budgets";
export { parseFeedXml } from "./lib/parse-feed";
export type { RawFeedItem } from "./lib/parse-feed";
export type {
  BudgetReport,
  CostReport,
  EnrichCandidate,
  EnrichResult,
  IngestPorts,
  IngestReport,
  SourceReport,
  TopicFilterReport,
} from "./lib/ports";
export { upsertBatches } from "./lib/upsert-rows";
// 이어달리기 (INV-CB1~CB5). 순수 함수라 배럴에 올려도 server-only 경계에 안 걸린다 —
// 라우트가 쓰는 자리이고, 유닛이 실행 환경 없이 목적지·횟수를 확인할 수 있어야 한다.
export {
  CHAIN_PARAM,
  buildChainRequest,
  parseChainIndex,
  sendChainRequest,
  shouldChain,
} from "./lib/chaining";
export type { ChainRequest } from "./lib/chaining";
export { createIngestPorts } from "./api/ports";
export { saveIngestRunReport } from "./api/save-run-report";
