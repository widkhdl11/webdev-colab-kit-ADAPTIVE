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
}

/** 수집 실행 한 번의 기록. */
export interface IngestRunRecord {
  id: string;
  startedAt: string;
  elapsedMs: number;
  budget: IngestRunBudget;
  usage: IngestRunUsage;
  sources: IngestRunSourceStat[];
}

/** 소스별 드릴다운에 쓰는 최소 투영. */
export interface RunSourceItem {
  id: string;
  title: string;
  titleKo: string | null;
  originalUrl: string;
  publishedAt: string;
}
