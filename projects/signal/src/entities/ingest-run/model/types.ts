/** 소스 하나의 실행 통계 (2026-08-17). ingest_run.sources jsonb 한 원소의 도메인 모양. */
export interface IngestRunSourceStat {
  sourceId: string;
  fetched: number;
  stored: number;
  dropped: number;
  error: string | null;
  filtered: number;
  filteredTitles: string[];
  /** 이 소스에서 온 후보 중 본문 추출이 실패한 건수. */
  extractionFailed: number;
  /** 이 소스가 쓴 토큰 합계(주제판정 + 요약·번역, 입력+출력) — 2026-08-17. */
  tokensUsed: number;
}

/** 실행 하나가 쓴 토큰. ingest_run.usage jsonb 의 도메인 모양(관찰용 — 불변식 아님). */
export interface IngestRunUsage {
  calls: number;
  topicCalls: number;
  topicInputTokens: number;
  topicOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  maxInputTokens: number;
  /** 단계별 소요 시간. 이 칸이 생기기 전(2026-09-22)에 쌓인 실행은 `null` 이다. */
  stageMs: IngestRunStageMs | null;
  /**
   * 핫이슈 판정·키워드가 쓴 토큰. 옛 실행은 `null` — 그때는 이 값이 저장되지 않았다.
   * `0` 과 다르다: 0 은 "안 썼다", null 은 "얼마인지 모른다"다.
   */
  hotIssueCalls: number | null;
  hotIssueInputTokens: number | null;
  hotIssueOutputTokens: number | null;
  keywordCalls: number | null;
  keywordInputTokens: number | null;
  keywordOutputTokens: number | null;
  /** 단계마다 실제로 부른 모델. 옛 실행은 `null` 이고 그때는 전부 한 모델이었다. */
  models: IngestRunStageModels | null;
}

/** 단계별로 부른 모델 이름. */
export interface IngestRunStageModels {
  topic: string;
  hotIssue: string;
  enrich: string;
  keywords: string;
}

/**
 * 시간 예산 때문에 무엇을 건너뛰었는지 (2026-08-17 리뷰로 추가).
 *
 * `budgetExhausted` 하나만 남기면 "예산이 떨어졌다"만 보이고 **어느 소스가, 어느 단계가**
 * 잘렸는지는 대시보드에서 안 보인다 — 정작 "이 소스가 왜 0건이지"를 답하려고 만든 화면인데
 * 그 답을 만드는 자리에서 값을 버리는 셈이라 여기에 그대로 옮겨 담는다
 * (features/ingestion 의 `BudgetReport` 와 같은 모양).
 */
export interface IngestRunBudget {
  exhausted: boolean;
  skippedSources: string[];
  skippedTopicChecks: number;
  skippedExtractions: number;
  skippedEnrichments: number;
  /**
   * 키워드·핫이슈 단계를 **통째로** 건너뛰었나 (2026-09-22).
   *
   * 건수가 아니라 참/거짓인 이유: 단계가 하나뿐이라 "몇 건 밀렸다"가 아니라 "안 돌았다"다.
   * 옛 행에는 이 칸이 없어서 `null` 이 온다 — 그건 "안 건너뛰었다"가 아니라 **모른다**다.
   */
  skippedKeywords: boolean | null;
  skippedHotIssue: boolean | null;
}

/**
 * 단계마다 걸린 시간(ms). 옛 행에는 없어서 `null` 이다.
 *
 * 화면이 이걸 읽는 이유: 총 소요시간만으로는 한 바퀴를 어떻게 나눌지 정할 수 없다.
 */
export interface IngestRunStageMs {
  feedMs: number;
  topicMs: number;
  storeMs: number;
  hotIssueMs: number;
  extractionMs: number;
  enrichmentMs: number;
  keywordsMs: number;
}

/** 수집 실행 한 번의 기록. */
/**
 * 하루 요금 상한이 그 실행에 어떻게 걸렸나 (ingest-chaining-budget INV-CB8).
 *
 * 옛 실행에는 없다 — 그때는 상한 자체가 없었다. 그래서 레코드에서는 `null` 이 될 수 있고,
 * **"상한이 없던 시절"과 "안 걸렸다"는 다르다.**
 */
export interface IngestRunCost {
  capUsd: number;
  spentUsd: number;
  capped: boolean;
  lookupFailed: boolean;
}

export interface IngestRunRecord {
  id: string;
  startedAt: string;
  elapsedMs: number;
  budget: IngestRunBudget;
  usage: IngestRunUsage;
  sources: IngestRunSourceStat[];
  /** 요금 상한 판정. 상한이 없던 시절의 실행은 null 이다. */
  cost: IngestRunCost | null;
}

/** 소스별 드릴다운에 쓰는 최소 투영. */
export interface RunSourceItem {
  id: string;
  title: string;
  titleKo: string | null;
  originalUrl: string;
  publishedAt: string;
}
