import type { FeedItemDraft, OfficialBasis } from "@/entities/article";
import type { Source } from "@/entities/source";
import type { Keywords } from "./parse-keywords";
import type { KeywordReport } from "./run-keywords";

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
  /**
   * 소스 설정(코드)의 id (2026-08-17). 후처리는 소스 경계를 모르고 전체 후보를
   * 한 풀에서 고르는데(pickFromPool), 이 값이 없으면 요약·번역에 쓴 토큰을
   * 소스별 대시보드에 못 돌려준다.
   */
  sourceId: string;
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
 * 후처리 결과. 요약·핵심 항목·번역 제목을 **한 번의 호출로 같이 받는다** —
 * 나눠 부르면 비용이 배로 늘고, 같은 근거를 두 번 보내게 된다 (INV-S6·S7).
 */
export interface EnrichResult {
  /** 요약. 요청하지 않았거나 실패하면 빈 문자열. */
  summary: string;
  /** 요약의 핵심 항목 (INV-S7). 요약이 없으면 빈 배열이어야 한다. */
  points: string[];
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

/** 뱃지 키워드를 물어볼 글 하나 (badge-keywords). */
export interface KeywordCandidate {
  id: string;
  title: string;
  /** 근거(출처 요약글 또는 본문). 이미 상한까지 잘려 온다 — 자르는 건 어댑터의 몫이다. */
  evidence: string;
}

/** DB 가 세어 준 "이미 쓰인 키워드" 한 줄 (INV-B3 의 앵커 재료). */
export interface KeywordAnchorRow {
  name: string;
  n: number;
}

/** 한 글에 붙일 키워드. 둘 다 빈 배열일 수 있다 — "물어봤고 없었다"도 결과다. */
export interface KeywordAttachment {
  itemId: string;
  fields: string[];
  kinds: string[];
}

/**
 * 뱃지 키워드 단계가 쓰는 포트 (badge-keywords INV-B1·B3·K1·K6).
 *
 * `IngestPorts` 가 이것을 물려받는다 — 매일 도는 주기와 백필이 **같은 구현**을 쓴다.
 * 두 벌로 두면 백필로 확인한 동작과 실제 주기가 갈린다.
 */
export interface KeywordPorts {
  /** 아직 물어보지 않은 글을 최신순으로. */
  listKeywordCandidates(limit: number): Promise<KeywordCandidate[]>;
  /**
   * 이미 쓰인 키워드를 축마다 따로 (INV-B3).
   *
   * **자르지 않고 다 준다.** 자르는 자리는 `runKeywords` 하나뿐이다(INV-K6) — 두 군데서
   * 자르면 상한이 두 번 걸려 실제로 실리는 개수가 상한보다 적어진다.
   */
  loadKeywordAnchors(): Promise<{ fields: KeywordAnchorRow[]; kinds: KeywordAnchorRow[] }>;
  /** 모델 호출. 못 읽으면 `keywords: null` — 실패와 "짚이는 게 없음"은 다르다. */
  extractKeywords(input: {
    title: string;
    evidence: string;
    knownFields: string[];
    knownKinds: string[];
  }): Promise<{ keywords: Keywords | null; usage: EnrichUsage }>;
  /**
   * 축과 함께 `tag` 에 올리고 `item_tag` 로 연결한다 (INV-B1·K1).
   *
   * **키워드가 0개인 글도 온다.** 붙일 링크는 없지만 "물어봤다"는 표시(`keywords_at`)를
   * 남겨야 그 글이 다음 주기 후보에서 빠진다 — 안 남기면 같은 질문에 매일 요금이 나간다.
   */
  attachKeywords(pairs: KeywordAttachment[]): Promise<void>;
}

export interface IngestPorts extends KeywordPorts {
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
  /**
   * canonical_url 기준 upsert (INV-C1). 새로 넣은 게 아니라 처리한 건수를 돌려준다.
   *
   * `runId` 는 이번 실행이 이 항목을 손댔다는 표시로 함께 저장된다 — 소스별 대시보드가
   * "이 소스가 이번 실행에서 가져온 글"을 골라낼 유일한 방법이다(2026-08-17).
   */
  upsertItems(items: FeedItemDraft[], runId: string): Promise<number>;
  /** 본문이 비어 있는 항목을 가져온다 (INV-S5). */
  listExtractionCandidates(): Promise<ExtractionCandidate[]>;
  /** 원문 URL 에서 본문 HTML 을 뽑는다. 못 뽑으면 던지거나 빈 문자열. */
  extractContent(url: string): Promise<string>;
  saveContent(id: string, contentHtml: string): Promise<void>;

  /** 후처리 후보를 가져온다. 무엇이 필요한지의 최종 판정은 파이프라인이 다시 한다. */
  listEnrichCandidates(): Promise<EnrichCandidate[]>;
  /**
   * 요약·항목·제목 번역 (Claude). 서버에서만 부른다 — 키가 나가면 INV-S4 위반이다.
   *
   * **태그는 여기서 안 만든다** (2026-08-30). 고정 5개 목록에서 고르게 하던 질문을 뺐고,
   * 뱃지 키워드가 그 자리를 물려받았다 — `runKeywords` 가 별도 단계로 돈다.
   */
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
      titleKo?: string;
      officialBasis?: OfficialBasis;
    },
  ): Promise<void>;
}

/** 주제 판정이 쓴 토큰. 요약과 합치지 않는다 — 합치면 어느 쪽이 튀는지 안 보인다. */
export interface TopicUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
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
  /**
   * 이 소스만의 주제 판정 결과 (2026-08-17).
   *
   * 판정 자체는 소스마다 따로 도는데(ingestSource), 예전엔 전체 합계로만 남겨 소스별
   * 대시보드가 "어느 소스가 많이 걸러지나"를 답할 수 없었다. 합계(`IngestReport.topicFilter`)는
   * 이 값들을 소스 전체에 걸쳐 더한 것이다 — 따로 계산하지 않는다.
   */
  topicFilter: TopicFilterReport;
  /** 이 소스만의 주제판정 토큰(2026-08-17) — topicFilter 와 같은 이유로 소스별로 남긴다. */
  topicUsage: TopicUsage;
}

export interface StageReport {
  attempted: number;
  succeeded: number;
  /** **목록 길이에서 나온다** — 세는 곳과 적는 곳이 갈리면 한쪽만 고치는 날 보고서가 틀린다. */
  failed: number;
  /** 그 단계 자체가 죽은 경우. 앞 단계 결과는 그대로 남는다. */
  error: string | null;
  /**
   * 개별 항목이 실패한 **이유** — 서로 다른 것만 모은다.
   *
   * 왜 필요한가: 2026-08-13 실행에서 요약 10건이 전부 실패했는데 리포트에는 제목만 남아,
   * 원인(크레딧 소진, HTTP 400)을 알아내려고 API 를 직접 찔러야 했다. 배포된 Cron 에서는
   * 터미널이 없어 더 나쁘다. 같은 이유가 10번 반복되면 한 줄이면 되므로 중복은 접는다 —
   * 어느 **항목**이 실패했는지는 failedTitles·failedUrls 가 이미 들고 있다.
   *
   * 개수(5개)와 **한 줄 길이(200자)** 를 둘 다 막는다 — 남의 서버가 준 헤더나 DB 오류에
   * 응답 본문이 실리면 한 줄이 수 KB 가 되고, 그게 Cron 응답과 로그에 그대로 남는다.
   */
  failureReasons: string[];
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
  /**
   * 소스 설정이 판정을 안 걸어서(`needsTopicCheck: false`) 그냥 통과시킨 건수 (INV-F4).
   *
   * 따로 세는 이유는 alreadyKnown 과 같다: 이게 없으면 "판정 2건 중 0건 걸러냄"이
   * **새 글이 2건뿐인 것**인지 **300건을 판정 없이 통과시킨 것**인지 구별되지 않는다.
   */
  notChecked: number;
  /**
   * 판정 호출이 실패한 이유 — 서로 다른 것만 (StageReport.failureReasons 와 같은 규칙).
   *
   * INV-F3 이 실패를 **통과**로 처리하므로, 이유가 안 남으면 필터가 통째로 죽은 주기가
   * "0건 걸러냄"으로 정상처럼 보인다. failedOpen 은 건수만 말하지 왜인지는 말하지 않는다.
   */
  failureReasons: string[];
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
  /**
   * 요약·번역이 소스별로 쓴 토큰 (2026-08-17).
   *
   * 후처리(runEnrichment)는 소스 경계 없이 전체 후보 풀 하나에서 도는데, 각 후보가
   * `sourceId` 를 들고 있어 여기서 소스별로 접을 수 있다. `SourceReport` 에 안 담는 이유는
   * 소스 루프가 끝난 뒤에야(추출·후처리 단계에서) 값이 생기기 때문이다 — 저장 시점
   * (save-run-report.ts)에서 소스별 통계에 합쳐 넣는다.
   */
  enrichUsageBySource: Record<string, { inputTokens: number; outputTokens: number }>;
  /**
   * 뱃지 키워드 (badge-keywords). 예산이 떨어져 단계를 통째로 건너뛰었으면 `null` 이다 —
   * **0건과 안 돌린 것을 가른다.** 0건은 후보가 없었다는 뜻이고, null 은 못 돌렸다는 뜻이다.
   */
  keywords: KeywordReport | null;
  /** 시간 예산 (2026-08-13 리뷰). */
  budget: BudgetReport;
}

/**
 * 시간 예산 때문에 건너뛴 것.
 *
 * 왜 리포트에 남기나: 예산 가드가 없으면 Vercel 이 함수를 죽여 **응답 자체가 없다** —
 * 그날의 실패 이유도 토큰 계측도 안 남고 요금만 나간다. 가드를 넣었으니 이제 응답은 오는데,
 * 건너뛴 것을 안 적으면 이번엔 "뒤쪽 소스가 매일 0건"이 **새 글이 없는 것**으로 보인다.
 * `alreadyKnown`·`notChecked` 를 따로 세는 이유와 같다.
 */
export interface BudgetReport {
  /** 하나라도 건너뛰었는가. */
  exhausted: boolean;
  /** 손도 못 댄 소스 id. 이 목록이 매 주기 같으면 소스 순서나 예산을 손볼 때다. */
  skippedSources: string[];
  /**
   * 선별 판정 단계에서 손도 못 댄 항목 수 (2026-08-16 리뷰).
   *
   * `TopicFilterReport.notChecked` 와 **다른 칸이어야 한다**: 저건 "판정을 안 걸기로 한 소스"고
   * 이건 "걸기로 했는데 시간이 없어 못 문 것"이다. 합치면 설정이 그런 건지 예산이 모자란 건지
   * 구별되지 않고, 판정을 14곳 전부에 켠 지금은 후자가 훨씬 잦아진다.
   */
  skippedTopicChecks: number;
  /** 건너뛴 본문 추출 건수. */
  skippedExtractions: number;
  /** 건너뛴 후처리(요약·번역) 건수. */
  skippedEnrichments: number;
  /**
   * 뱃지 키워드 단계를 통째로 건너뛰었나.
   *
   * 건수가 아니라 참/거짓인 이유: 이 단계는 후보 조회부터가 자기 안에 있어서, 예산이
   * 떨어지면 **몇 건이 밀렸는지 알 방법 자체가 없다**(물어보려면 그 조회를 해야 한다).
   * 밀린 글은 `keywords_at` 이 비어 있어 다음 주기에 그대로 다시 잡힌다.
   */
  skippedKeywords: boolean;
}
