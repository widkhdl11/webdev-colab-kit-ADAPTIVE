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
 * 후처리(요약·제목 번역) 대상 (INV-S3·S6).
 *
 * **두 작업의 조건이 다르다** — 한 후보 목록에서 항목마다 갈린다:
 *   - 요약: `summary` 가 비어 있고 **근거(본문 또는 출처 요약글)가 있을 때만**.
 *     제목만 주고 요약시키면 모델이 지어낸다(INV-S1 위반).
 *   - 제목 번역: `title_ko` 가 비어 있으면 한다. **근거가 없어도 한다** —
 *     번역의 근거는 제목 자신이다. 이걸 요약과 같은 조건으로 묶으면 본문도 요약글도 없는
 *     항목(HN 링크 글 다수)이 영어 제목으로 영영 남는다.
 */
export interface EnrichCandidate {
  id: string;
  title: string;
  titleKo: string | null;
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

/**
 * 후처리 결과. 요약·핵심 항목·태그·번역 제목을 **한 번의 호출로 같이 받는다** —
 * 나눠 부르면 비용이 배로 늘고, 같은 근거를 두 번 보내게 된다 (INV-T3·S6·S7).
 */
export interface EnrichResult {
  /** 요약. 요청하지 않았거나 실패하면 빈 문자열. */
  summary: string;
  /** 요약의 핵심 항목 (INV-S7). 요약이 없으면 빈 배열이어야 한다. */
  points: string[];
  tags: string[];
  /** 한국어 제목 (INV-S6). 요청하지 않았거나 실패하면 null. */
  titleKo: string | null;
}

/** 항목마다 무엇이 필요한지. 둘 다 false 면 부르지 않는다. */
export interface EnrichNeeds {
  needSummary: boolean;
  needTitle: boolean;
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

  /** 후처리 후보를 가져온다. 무엇이 필요한지의 최종 판정은 파이프라인이 다시 한다. */
  listEnrichCandidates(): Promise<EnrichCandidate[]>;
  /** 요약·항목·태그·제목 번역 (Claude). 서버에서만 부른다 — 키가 나가면 INV-S4 위반이다. */
  enrich(
    input: {
      title: string;
      /** 근거. 본문이 있으면 본문, 없으면 출처 요약글. 요약이 필요 없으면 빈 값일 수 있다. */
      evidence: string;
    } & EnrichNeeds,
  ): Promise<EnrichResult>;
  /**
   * 만들어진 것만 저장한다. 주지 않은 필드는 건드리지 않는다 —
   * 번역만 성공하고 요약이 실패한 항목의 `summary` 를 덮으면 재시도 신호가 사라진다(INV-S3).
   */
  saveEnrichment(
    id: string,
    patch: { summary?: string; points?: string[]; tags?: string[]; titleKo?: string },
  ): Promise<void>;
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
  /** 제목 번역 (INV-S6). 요약과 같은 호출에서 처리되지만 조건이 달라 따로 센다. */
  titles: StageReport;
}
