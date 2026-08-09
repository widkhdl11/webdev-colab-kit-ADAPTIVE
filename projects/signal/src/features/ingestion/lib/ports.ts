import type { FeedItemDraft } from "@/entities/article";
import type { Source } from "@/entities/source";

/**
 * 수집 파이프라인이 바깥 세계에 닿는 자리 — 네트워크·DB·LLM 을 여기 한 곳으로 모은다.
 *
 * 이렇게 갈라 두는 이유는 테스트 편의가 아니라 **격리 규칙(INV-C4·S2)을 코드로 확인하기
 * 위해서**다. 파이프라인이 fetch·SQL 을 직접 부르면 "한 소스가 죽어도 계속 간다"를
 * 실제 서버 없이 확인할 방법이 없고, 그러면 그 불변식은 글로만 남는다.
 */

/**
 * 요약 재시도 후보 (INV-S3).
 *
 * 실제 대상은 `summary` 가 비어 있고 **근거가 있는** 것뿐이다. 근거는 본문 또는 출처 요약글 —
 * 제목만 주고 요약시키면 모델이 지어낸다(INV-S1 위반).
 */
export interface SummaryCandidate {
  id: string;
  title: string;
  contentHtml: string;
  sourceExcerpt: string | null;
  summary: string | null;
}

/** 본문이 없어 추출을 시도할 항목 (INV-S5). */
export interface ExtractionCandidate {
  id: string;
  /** 정규화 이전 주소 — 사람이 여는 주소가 곧 본문이 있는 주소다. */
  url: string;
}

/** 요약 결과. 태그 분류를 같이 받는다 (INV-T3) — 호출을 두 번 하면 비용도 두 배다. */
export interface SummaryResult {
  summary: string;
  tags: string[];
}

export interface IngestPorts {
  /** 소스 하나의 피드를 읽는다. 실패하면 던진다 — 격리는 파이프라인이 한다. */
  fetchFeed(source: Source): Promise<unknown[]>;
  /** canonical_url 기준 upsert (INV-C1). 새로 넣은 게 아니라 처리한 건수를 돌려준다. */
  upsertItems(items: FeedItemDraft[]): Promise<number>;
  /** 본문이 비어 있는 항목을 가져온다 (INV-S5). */
  listExtractionCandidates(): Promise<ExtractionCandidate[]>;
  /** 원문 URL 에서 본문 HTML 을 뽑는다. 못 뽑으면 던지거나 빈 문자열. */
  extractContent(url: string): Promise<string>;
  saveContent(id: string, contentHtml: string): Promise<void>;

  /** 요약 재시도 후보를 가져온다. 최종 판정은 파이프라인이 다시 한다. */
  listSummaryCandidates(): Promise<SummaryCandidate[]>;
  /** 요약·태그 생성 (Claude). 서버에서만 부른다 — 키가 클라이언트로 가면 INV-S4 위반이다. */
  summarize(input: {
    title: string;
    /** 근거. 본문이 있으면 본문, 없으면 출처 요약글. 빈 값으로는 부르지 않는다. */
    evidence: string;
  }): Promise<SummaryResult>;
  /** 요약과 태그를 함께 저장한다. 태그는 목록 안의 것만 온다 (INV-T3). */
  saveSummary(id: string, summary: string, tags: string[]): Promise<void>;
}

export interface SourceReport {
  sourceId: string;
  /** 소스가 준 항목 수. */
  fetched: number;
  /** 경계를 통과해 적재한 건수. */
  stored: number;
  /** 검증에서 버린 건수 (INV-C3). */
  dropped: number;
  /** 실패 사유. null 이면 정상. */
  error: string | null;
}

export interface StageReport {
  attempted: number;
  succeeded: number;
  failed: number;
  /** 그 단계 자체가 죽은 경우. 앞 단계 결과는 그대로 남는다. */
  error: string | null;
}

export interface IngestReport {
  sources: SourceReport[];
  /** 실패한 소스 id — 한눈에 보라고 따로 뽑는다. */
  failedSources: string[];
  /** 본문 추출 (INV-S5). */
  extraction: StageReport;
  summaries: StageReport & {
    /** 근거가 없어 아예 시도하지 않은 건수 (INV-S3). 실패와 구분한다 — 재시도해도 소용없다. */
    skippedNoEvidence: number;
  };
}
