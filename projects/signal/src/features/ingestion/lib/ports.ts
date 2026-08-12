import type { FeedItemDraft, OfficialBasis } from "@/entities/article";
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
  /**
   * 지금 저장돼 있는 공식 근거 (INV-O2). 모델 판단을 쓸지 말지가 이 값으로 갈린다 —
   * 이미 `byUrl` 이면 덮지 않는다. 안 들고 오면 그 판단을 파이프라인이 할 수 없다.
   */
  officialBasis: OfficialBasis;
}

/** 본문이 없어 추출을 시도할 항목 (INV-S5). */
export interface ExtractionCandidate {
  id: string;
  /** 정규화 이전 주소 — 사람이 여는 주소가 곧 본문이 있는 주소다. */
  url: string;
}

/**
 * 호출 한 번이 쓴 토큰. **개발용 계측이라 불변식이 아니다** — 이 값으로 무엇을 막지 않는다.
 *
 * 왜 결과에 같이 싣나: 요약이 실패해도 요금은 이미 나갔다. 실패를 세는 곳과 토큰을 세는 곳이
 * 갈리면 "다 실패했는데 돈은 나갔다"가 보고서 어디에도 안 남는다.
 */
export interface EnrichUsage {
  inputTokens: number;
  outputTokens: number;
  /** 캐시에서 읽은 입력 토큰(원가의 약 1/10). */
  cacheReadTokens: number;
  /** 캐시에 새로 쓴 입력 토큰(원가의 약 1.25배). */
  cacheWriteTokens: number;
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
  /**
   * 글 내용으로 본 공식 발표 여부 (INV-O2 의 `byContent`). **주소 근거와는 다른 값이다** —
   * 이건 모델 판단이라 틀릴 수 있고, 요청하지 않았거나 응답에 없으면 false 다.
   */
  officialByContent: boolean;
  /** 이 호출이 쓴 토큰. **빈 결과를 돌려줄 때도 채운다** — 실패해도 요금은 나갔다. */
  usage: EnrichUsage;
}

/** 항목마다 무엇이 필요한지. 둘 다 false 면 부르지 않는다. */
export interface EnrichNeeds {
  needSummary: boolean;
  needTitle: boolean;
}

export interface IngestPorts {
  /** 소스 하나의 피드를 읽는다. 실패하면 던진다 — 격리는 파이프라인이 한다. */
  fetchFeed(source: Source): Promise<unknown[]>;
  /**
   * 제목만 보고 주제(AI·IT) 안인지 정한다 (INV-F1). 요약·본문추출보다 먼저, 적재 전에 부른다.
   * 실패하면 던진다 — 거르지 않고 통과시키는 판단은 파이프라인이 한다(INV-F3).
   *
   * 토큰을 같이 돌려주는 이유: 이 호출도 요금이 나간다. 요약만 세면 계측이
   * 파이프라인의 절반을 못 본다 — 판정이 70건씩 도는 주기가 보고서에서 안 보인다.
   */
  judgeTopic(title: string): Promise<{ onTopic: boolean; usage: EnrichUsage }>;
  /**
   * 준 주소 중 **이미 적재돼 있는 것**을 돌려준다.
   *
   * 주제 판정을 새 항목에만 하려고 쓴다. 이미 있는 항목은 주제 밖으로 판정돼도 DB 에서
   * 사라지지 않으므로(INV-F2 는 "적재하지 않는다"이지 "지운다"가 아니다) 그 호출은
   * 요금만 쓰고 아무 효과가 없다. OpenAI 아카이브는 최신 50건이 매 주기 같다.
   *
   * 실패하면 던진다 — 파이프라인이 "전부 새 항목"으로 보고 판정한다(모르면 판정하는 쪽).
   */
  listKnownUrls(canonicalUrls: string[]): Promise<string[]>;
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
    patch: {
      summary?: string;
      points?: string[];
      tags?: string[];
      titleKo?: string;
      officialBasis?: OfficialBasis;
    },
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
  /** **목록 길이에서 나온다** — 세는 곳과 적는 곳이 갈리면 한쪽만 고치는 날 보고서가 틀린다. */
  failed: number;
  /** 그 단계 자체가 죽은 경우. 앞 단계 결과는 그대로 남는다. */
  error: string | null;
}

/**
 * 이 한 바퀴가 쓴 토큰 (개발용 계측).
 *
 * 무엇을 막는 값이 아니라 **이상한 것을 눈에 띄게 하는 값**이다. 보는 법:
 *   - `calls` 는 늘었는데 요약 성공이 안 늘면 → 실패에 돈을 쓰고 있다
 *   - `maxInputTokens` 만 크게 튀면 → 어떤 항목의 근거가 비정상적으로 크다
 *   - `cacheReadTokens` 가 계속 0 이면 → 프롬프트 캐싱이 안 걸리고 있다
 */
export interface UsageReport {
  /** enrich 호출 횟수. **실패한 호출도 센다** — 실패해도 요금은 나갔다. */
  calls: number;
  /**
   * 주제 판정 호출 횟수와 토큰. 요약과 **합치지 않는다** — 합치면 어느 쪽이 튀는지 안 보인다.
   * 판정은 건당 작지만 건수가 많고(소스당 최대 50건), 요약은 반대다.
   */
  topicCalls: number;
  topicInputTokens: number;
  topicOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** 한 호출이 쓴 최대 입력 토큰. 합계가 멀쩡해도 여기가 튀면 한 건이 범인이다. */
  maxInputTokens: number;
}

/**
 * 주제 판정 (INV-F1·F2·F3).
 *
 * 실패(failedOpen)는 filtered 에 안 들어간다 — 실패는 "거르지 않음"으로 처리되기 때문이다.
 * 조용히 삼키면 판정 호출이 매 주기 죽어도 아무 데도 안 보인다.
 */
export interface TopicFilterReport {
  /** 실제로 모델에 물어본 건수. 이미 적재된 항목은 여기 안 들어간다. */
  attempted: number;
  /**
   * 이미 적재돼 있어 판정을 건너뛴 건수.
   *
   * 따로 세는 이유: 이게 없으면 "판정 2건"이 **새 글이 2건뿐인 것**인지
   * **필터가 죽은 것**인지 구별되지 않는다.
   */
  alreadyKnown: number;
  /** 주제 밖으로 판정돼 적재하지 않은 건수. */
  filtered: number;
  /** 걸러진 항목의 제목 — 오판을 알아챌 유일한 방법이다(INV-F2). */
  filteredTitles: string[];
  /** 판정 호출이 실패해 거르지 않고 통과시킨 건수(INV-F3). */
  failedOpen: number;
}

export interface IngestReport {
  sources: SourceReport[];
  /** 실패한 소스 id — 한눈에 보라고 따로 뽑는다. */
  failedSources: string[];
  /** 주제 판정 (INV-F1·F2·F3). */
  topicFilter: TopicFilterReport;
  /** 본문 추출 (INV-S5). */
  extraction: StageReport & {
    /**
     * 추출에 실패한 원문 주소. 후보에는 제목이 없어서 주소로 남긴다.
     *
     * 건수만 남기면 같은 사이트가 매 주기 403 을 돌려줘도 "실패 1"만 반복된다 —
     * 소스 목록을 손볼 근거가 보고서에 안 남는다.
     */
    failedUrls: string[];
  };
  summaries: StageReport & {
    /** 근거가 없어 아예 시도하지 않은 건수 (INV-S3). 실패와 구분한다 — 재시도해도 소용없다. */
    skippedNoEvidence: number;
    /** 요약에 실패한 항목의 제목. 걸러진 제목을 남기는 것(INV-F2)과 같은 이유다. */
    failedTitles: string[];
  };
  /** 제목 번역 (INV-S6). 요약과 같은 호출에서 처리되지만 조건이 달라 따로 센다. */
  titles: StageReport & {
    /** 번역에 실패한 항목의 **원문** 제목. */
    failedTitles: string[];
  };
  /** 토큰 사용량 (개발용). 불변식이 아니라 관찰용이다. */
  usage: UsageReport;
}
