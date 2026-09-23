import { nextOfficialBasis, parseFeedItem } from "@/entities/article";
import type { FeedItemDraft, OfficialBasis } from "@/entities/article";
import { SUBJECT_SITES, sourceWeightLookup } from "@/entities/source";
import type { Source } from "@/entities/source";
import {
  ENRICH_MODEL,
  ENRICH_POOL,
  HOT_ISSUE_BATCH,
  HOT_ISSUE_CONCURRENCY,
  HOT_ISSUE_MODEL,
  KEYWORD_MODEL,
  TOPIC_MODEL,
  DAILY_COST_CAP_USD,
  INGEST_BUDGET_MS,
  KEYWORD_BATCH,
  KEYWORD_CONCURRENCY,
  MAX_FAILURE_REASON_LENGTH,
  MAX_FAILURE_REASONS,
  MAX_TITLE_LENGTH,
  TOPIC_CONCURRENCY,
  WORST_CASE_MS,
} from "./budgets";
import { createCostMeter } from "./cost-cap";
import type { CostMeter } from "./cost-cap";
import { runHotIssue } from "./run-hot-issue";
import { runKeywords } from "./run-keywords";
import type {
  IngestPorts,
  IngestReport,
  SourceReport,
  StageMs,
  TopicFilterReport,
  TopicUsage,
} from "./ports";

/**
 * 수집 한 바퀴 — ingestion-ranking INV-C4·S2·S3 강제 지점.
 *
 * 규칙 하나로 요약하면 **어디서 실패해도 나머지는 간다**. 이 함수는 던지지 않는다.
 * 던지면 Cron 한 번이 통째로 날아가고, 다음 주기까지 피드가 안 갱신된다.
 */

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * 실패 이유를 목록에 담되 **같은 것은 한 번만** 담는다.
 *
 * 상한을 두는 이유: 이유가 항목마다 다른 날(주소가 섞인 메시지 등) 리포트가 통째로
 * 실패 목록이 된다. Cron 응답 본문은 로그에도 남으므로 무한정 키우지 않는다.
 *
 * **개수와 길이를 둘 다 막는다** (2026-08-13 리뷰): 개수만 막으면 절반이다 —
 * 남의 서버가 준 `content-type` 헤더나 DB 오류 메시지에 응답 본문이 실리면 한 줄이 수 KB 가 된다.
 */
function noteFailure(into: string[], e: unknown): void {
  const reason = errorText(e).slice(0, MAX_FAILURE_REASON_LENGTH);
  if (into.length >= MAX_FAILURE_REASONS || into.includes(reason)) return;
  into.push(reason);
}

/**
 * 한 소스에서 한 번에 가져갈 최대 건수.
 *
 * 왜 필요한가: OpenAI 피드는 전체 아카이브 1115건을 준다(2026-08-09 확인). 그대로 넣으면
 * 첫 수집에 천 건이 들어오고 그만큼 요약 대기열이 쌓인다. 최신 것부터 자른다 —
 * 오래된 글은 어차피 시간감쇠로 피드 아래에 있다.
 */
export const MAX_ITEMS_PER_SOURCE = 50;

/** 같은 배치 안의 중복을 접는다 (INV-C1). 뒤에 온 것이 최신이므로 뒤를 남긴다. */
function dedupeByCanonicalUrl(items: FeedItemDraft[]): FeedItemDraft[] {
  const byUrl = new Map<string, FeedItemDraft>();
  for (const item of items) byUrl.set(item.canonicalUrl, item);
  return [...byUrl.values()];
}

/**
 * 제목만 보고 주제 밖 항목을 거른다 (INV-F1·F2·F3).
 *
 * 요약·본문추출보다 앞, 적재보다 앞에서 돈다 — 여기서 걸러진 항목은 upsert 자체를 안 타서
 * 이후 어떤 단계의 후보 목록에도 나타날 수 없다. 판정 실패는 개별 항목 단위로 잡는다:
 * 한 건이 타임아웃났다고 나머지 판정을 멈추면 그 주기의 필터링 자체가 무의미해진다.
 */
/** 동시 판정 건수는 budgets.ts 가 정한다 (테스트가 값을 못 박는 자리). */
export { TOPIC_CONCURRENCY };

/**
 * 이 한 바퀴에 남은 시간 (2026-08-13 리뷰).
 *
 * 왜 필요한가: 단계가 전부 순차라 최악치가 Vercel 상한(300초)을 넘는다 —
 * 피드 14곳×15초 + 판정 + 추출 10×15초 + 요약 10×30초. 넘기면 함수가 죽고
 * **응답 본문이 없다.** 이 파이프라인이 애써 모은 실패 이유·토큰 계측이 제일 필요한 날
 * 하나도 안 남고, 요금만 나간 상태가 된다.
 *
 * 시계를 주입받는 이유: 테스트가 실제로 4분을 기다릴 수는 없다. 논리 시각(`now`)과 섞지
 * 않는 것도 중요하다 — `now` 는 발행시각 계산용 고정값이라 흐르지 않는다.
 */
interface Budget {
  exhausted(): boolean;
  /**
   * 지금부터 `ms` 밀리초를 더 써도 마감 안인가 (INV-CB9).
   *
   * `exhausted()` 와 나눈 이유: 마감까지 1초 남았는지 확인하고 30초짜리 요약을 시작하면
   * 그 한 건이 Vercel 300초를 넘긴다 — 넘기면 **응답 본문이 없어** 이 리포트가 통째로
   * 사라진다. "남았나"가 아니라 "그 한 건을 끝낼 만큼 남았나"를 물어야 한다.
   */
  canAfford(ms: number): boolean;
  skippedSources: string[];
  skippedTopicChecks: number;
  skippedExtractions: number;
  skippedEnrichments: number;
  /** 키워드 단계를 통째로 건너뛰었나 — 단계가 하나뿐이라 건수가 아니라 참/거짓이다. */
  skippedKeywords: boolean;
  /** 후보 조회가 풀 상한에서 잘렸나 (INV-CB10). */
  poolTruncated: boolean;
  /** 핫이슈 판정 단계를 통째로 건너뛰었나. 위와 같은 이유로 참/거짓이다. */
  skippedHotIssue: boolean;
}

/**
 * 단계마다 걸린 시간을 모으는 그릇 (2026-09-22).
 *
 * 예산(`Budget`)과 같은 방식으로 단계에 들고 다닌다 — 돌려주는 값에 섞으면 단계마다
 * 반환 타입이 하나씩 늘고, 실패 경로에서 빠뜨리기 쉽다. 예산이 그래서 이 모양이다.
 *
 * 시계를 주입받는 이유도 예산과 같다: 테스트가 실제로 4분을 기다릴 수 없고,
 * 논리 시각(`now`)과 섞으면 안 된다(그건 발행시각 계산용 고정값이라 흐르지 않는다).
 */
interface Timing {
  now(): number;
  ms: StageMs;
}

/** 한 단계를 재서 그릇에 더한다. **던져도 잰다** — 실패한 단계도 시간은 썼다. */
async function measure<T>(t: Timing, key: keyof StageMs, fn: () => Promise<T>): Promise<T> {
  const at = t.now();
  try {
    return await fn();
  } finally {
    t.ms[key] += t.now() - at;
  }
}

async function filterByTopic(
  items: FeedItemDraft[],
  ports: IngestPorts,
  needsTopicCheck: boolean,
  budget: Budget,
  timing: Timing,
  meter: CostMeter,
): Promise<{ kept: FeedItemDraft[]; report: TopicFilterReport; usage: TopicUsage }> {
  // INV-F4: 주제가 안 섞이는 소스(AI 전용 피드)에는 판정을 걸지 않는다.
  // 건너뛴 건수는 반드시 남긴다 — 안 남기면 "0건 걸러냄"이 새 글이 없는 것인지
  // 판정 없이 통과시킨 것인지 구별되지 않는다(alreadyKnown 을 따로 세는 이유와 같다).
  if (!needsTopicCheck) {
    return {
      kept: items,
      report: {
        attempted: 0,
        alreadyKnown: 0,
        notChecked: items.length,
        failureReasons: [],
        filtered: 0,
        filteredTitles: [],
        failedOpen: 0,
      },
      usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
    };
  }

  // 이미 적재된 항목은 판정하지 않는다. 주제 밖으로 나와도 DB 에서 사라지지 않으므로
  // (INV-F2 는 "적재하지 않는다"이지 "지운다"가 아니다) 그 호출은 요금만 쓴다.
  // 조회가 실패하면 전부 새 항목으로 본다 — 모르면 판정하는 쪽이 안전하다.
  let known = new Set<string>();
  try {
    known = new Set(await ports.listKnownUrls(items.map((i) => i.canonicalUrl)));
  } catch {
    known = new Set();
  }

  const kept: FeedItemDraft[] = [];
  const filteredTitles: string[] = [];
  const usage: TopicUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  let attempted = 0;
  let alreadyKnown = 0;
  let failedOpen = 0;
  const failureReasons: string[] = [];

  // 판정 결과를 **입력 순서 그대로** 담는다. 도착 순서로 담으면 빠른 응답이 앞으로 와서
  // 최신순 정렬이 무너진다(MAX_ITEMS_PER_SOURCE 로 자를 때 어느 것이 잘리는지가 바뀐다).
  //
  // 기본값은 **통과(true)** 다 (INV-F3: 모르면 거르지 않는다). 채우지 않은 구멍이 남으면
  // `undefined` = 거짓 = "주제 밖"이 되어, 있지도 않은 판정이 리포트에 제목까지 달고 남는다.
  const decisions = new Array<boolean>(items.length).fill(true);

  for (let start = 0; start < items.length; start += TOPIC_CONCURRENCY) {
    // 예산이 떨어지면 남은 것은 **묻지 않고 통과**시킨다 (INV-F3: 모르면 거르지 않는다).
    // `decisions` 기본값이 true 라 그대로 두면 통과가 되지만, 건수는 반드시 남긴다 —
    // 안 남기면 "판정 8건 중 0건 걸러냄"이 *새 글이 8건뿐인 것*으로 보인다.
    //
    // 소스 루프 머리의 확인만으로는 부족하다: 시작 시점만 통과하면 한 소스가 최대 50건
    // (7묶음)을 끝까지 돌리고, 판정이 타임아웃으로 떨어지면 묶음당 15초다.
    // INV-CB9: 남은 시간이 한 묶음의 최악치보다 적으면 시작하지 않는다.
    // **상한(INV-CB8)은 여기서 안 본다** — 주제 판정이 멈추면 그날 들어온 글이 전부
    // 조용히 「소식」으로 가서 화면이 틀린다. 멈춰도 화면이 안 틀리는 단계만 멈춘다.
    if (!budget.canAfford(WORST_CASE_MS.topic)) {
      budget.skippedTopicChecks += items.length - start;
      break;
    }
    const chunk = items.slice(start, start + TOPIC_CONCURRENCY);
    // 묶음 단위로 잰다. 건당으로 재면 여덟 건이 동시에 도는 시간이 여덟 번 더해져
    // 합계가 실제 경과보다 커지고, 그 값으로 문턱을 정하면 지나치게 일찍 끊는다.
    await measure(timing, "topicMs", () => Promise.all(
      chunk.map(async (item, offset) => {
        const at = start + offset;
        if (known.has(item.canonicalUrl)) {
          // 판정은 건너뛰지만 적재는 한다 — 본문·출처 요약글이 새로 올 수 있다.
          alreadyKnown += 1;
          decisions[at] = true;
          return;
        }

        attempted += 1;
        try {
          const verdict = await ports.judgeTopic(item.title);
          decisions[at] = verdict.onTopic;
          // 실패한 호출에도 요금은 나갔지만 그건 예외 경로라 토큰을 받을 길이 없다.
          // 성공한 호출만이라도 세면 "판정에 얼마나 쓰는가"는 보인다.
          usage.calls += 1;
          usage.inputTokens += verdict.usage.inputTokens;
          usage.outputTokens += verdict.usage.outputTokens;
          // 이번 바퀴가 쓴 돈에 바로 더한다 (INV-CB7) — 리포트는 바퀴가 끝나야 저장되므로
          // 저장된 합계만 보면 이 바퀴 지출이 통째로 안 보인다.
          meter.add(TOPIC_MODEL, verdict.usage.inputTokens, verdict.usage.outputTokens);
        } catch (e) {
          decisions[at] = true; // INV-F3: 판정이 실패하면 거르지 않는다.
          failedOpen += 1;
          // 통과시키되 **조용히는 아니다** — 이유가 없으면 필터가 죽은 주기가 정상으로 보인다.
          noteFailure(failureReasons, e);
        }
      }),
    ));
  }

  for (const [at, item] of items.entries()) {
    if (decisions[at]) kept.push(item);
    // 제목은 남의 서버가 준 문자열이고 그대로 Cron 응답 본문과 로그에 들어간다.
    // 개수는 못 막는다(INV-F2 가 걸러진 것 전부의 제목을 요구한다) — 한 줄 길이만 막는다.
    else filteredTitles.push(item.title.slice(0, MAX_TITLE_LENGTH));
  }

  return {
    kept,
    usage,
    report: {
      attempted,
      alreadyKnown,
      notChecked: 0,
      failureReasons,
      filtered: filteredTitles.length,
      filteredTitles,
      failedOpen,
    },
  };
}

function mergeTopicFilterReports(reports: TopicFilterReport[]): TopicFilterReport {
  return reports.reduce(
    (acc, r) => ({
      attempted: acc.attempted + r.attempted,
      alreadyKnown: acc.alreadyKnown + r.alreadyKnown,
      notChecked: acc.notChecked + r.notChecked,
      // 소스마다 다른 이유가 나올 수 있다. 합칠 때도 중복은 접고 상한을 지킨다.
      failureReasons: [...new Set([...acc.failureReasons, ...r.failureReasons])].slice(
        0,
        MAX_FAILURE_REASONS,
      ),
      filtered: acc.filtered + r.filtered,
      filteredTitles: [...acc.filteredTitles, ...r.filteredTitles],
      failedOpen: acc.failedOpen + r.failedOpen,
    }),
    {
      attempted: 0,
      alreadyKnown: 0,
      notChecked: 0,
      failureReasons: [] as string[],
      filtered: 0,
      filteredTitles: [] as string[],
      failedOpen: 0,
    },
  );
}

async function ingestSource(
  source: Source,
  ports: IngestPorts,
  now: Date,
  budget: Budget,
  timing: Timing,
  runId: string,
  meter: CostMeter,
): Promise<{ report: SourceReport; topicFilter: TopicFilterReport; topicUsage: TopicUsage }> {
  const base = { sourceId: source.id, fetched: 0, stored: 0, dropped: 0 };
  // try 바깥에 둔다 — 적재가 던져도 **이미 한 판정은 리포트에 남아야 한다**(INV-F2).
  // 안에 두면 하필 DB 가 흔들린 주기에 "무엇을 걸렀나"가 통째로 사라진다. 호출은 이미 나갔다.
  let topicFilter: TopicFilterReport = {
    attempted: 0,
    alreadyKnown: 0,
    notChecked: 0,
    failureReasons: [],
    filtered: 0,
    filteredTitles: [],
    failedOpen: 0,
  };
  // 토큰도 같은 이유로 try 바깥이다 — 적재가 죽어도 이미 쓴 돈은 보고서에 남아야 한다.
  let topicUsage: TopicUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const raw = await measure(timing, "feedMs", () => ports.fetchFeed(source));
    const drafts = raw
      .map((item) =>
        parseFeedItem(item, {
          fetchedAt: now,
          sourceId: source.id,
          sourceName: source.name,
          subjectSites: SUBJECT_SITES,
          // 이 피드가 타임존 없이 주는 시각을 어느 시간대로 읽을지 (INV-C5).
          feedTimezone: source.feedTimezone,
        }),
      )
      .filter((d): d is FeedItemDraft => d !== null);

    // 최신 것부터 상한까지만. 자르기 전에 중복을 접어야 "중복 두 건 때문에 한 건 밀림"이 안 생긴다.
    const unique = dedupeByCanonicalUrl(drafts)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, MAX_ITEMS_PER_SOURCE);

    const filtered = await filterByTopic(unique, ports, source.needsTopicCheck, budget, timing, meter);
    topicFilter = filtered.report;
    topicUsage = filtered.usage;
    const { kept } = filtered;

    // 넣을 게 없으면 부르지 않는다 — 빈 upsert 로 실패 위험만 늘릴 이유가 없다.
    if (kept.length > 0) await measure(timing, "storeMs", () => ports.upsertItems(kept, runId));

    return {
      report: {
        ...base,
        fetched: raw.length,
        stored: kept.length,
        dropped: raw.length - drafts.length,
        error: null,
        topicFilter,
        topicUsage,
      },
      topicFilter,
      topicUsage,
    };
  } catch (e) {
    // 적재 실패도 여기서 잡는다. 네트워크만 감싸면 DB 오류 하나가 전체를 세운다.
    return {
      report: { ...base, error: errorText(e), topicFilter, topicUsage },
      topicFilter,
      topicUsage,
    };
  }
}

/**
 * 본문이 없는 항목의 본문을 원문에서 뽑는다 (INV-S5).
 *
 * 요약보다 **먼저** 돈다: 여기서 채워진 본문이 곧 요약의 근거가 되기 때문이다.
 * 실패는 항목 단위로 격리한다 — OpenAI 원문은 403 이고(2026-08-09 실측) 그건 정상 경로다.
 */
async function runExtraction(
  ports: IngestPorts,
  budget: Budget,
  timing: Timing,
  meter: CostMeter,
): Promise<IngestReport["extraction"]> {
  // 실패는 세지 않고 **적는다** — 건수는 목록 길이에서 나온다(둘이 갈리면 보고서가 조용히 틀린다).
  const failedUrls: string[] = [];
  const failureReasons: string[] = [];
  const result = { attempted: 0, succeeded: 0, error: null as string | null };
  const done = () => ({ ...result, failed: failedUrls.length, failedUrls, failureReasons });

  let candidates;
  try {
    candidates = await ports.listExtractionCandidates();
  } catch (e) {
    return { ...done(), error: errorText(e) };
  }

  for (const item of candidates) {
    // 멈추는 이유가 둘이다.
    //   시간 (INV-CB9): 한 건의 최악치보다 적게 남았으면 시작하지 않는다. 계속 가면
    //     Vercel 이 함수를 죽여 응답 본문이 통째로 사라진다 — 실패 이유·토큰 계측이 다 날아간다.
    //   요금 (INV-CB8): 상한에 닿으면 본문 긁기는 멈춘다. 본문이 없으면 요약·키워드의
    //     근거가 없어서, 긁어 놓고 못 쓰면 다음 단계가 어차피 안 돈다.
    if (!budget.canAfford(WORST_CASE_MS.extraction) || meter.capped()) {
      budget.skippedExtractions += candidates.length - result.attempted;
      break;
    }
    result.attempted += 1;
    try {
      const html = await measure(timing, "extractionMs", () => ports.extractContent(item.url));
      // 빈 본문을 저장하면 다음 주기에 후보에서 빠지지 않고 계속 재시도된다 —
      // 그건 맞다(사이트가 고쳐질 수 있다). 다만 저장할 것은 없다.
      if (html.trim() === "") {
        failedUrls.push(item.url);
        noteFailure(failureReasons, new Error("추출 결과가 비어 있음"));
        continue;
      }
      await ports.saveContent(item.id, html);
      result.succeeded += 1;
    } catch (e) {
      failedUrls.push(item.url);
      noteFailure(failureReasons, e);
    }
  }

  return done();
}

/**
 * 요약·핵심 항목·제목 번역을 채운다 (INV-S3·S6·S7).
 *
 * 한 항목에 대해 **호출은 한 번**이고, 그 안에서 무엇을 요청할지가 갈린다. 요약은 근거가
 * 있어야 하지만 번역은 제목 자체가 근거라 근거 없는 항목도 번역한다 — 둘을 같은 조건으로
 * 묶으면 본문도 요약글도 없는 항목이 영어 제목으로 영영 남는다.
 */
async function runEnrichment(
  ports: IngestPorts,
  budget: Budget,
  meter: CostMeter,
): Promise<{
  summaries: IngestReport["summaries"];
  titles: IngestReport["titles"];
  /**
   * 주제 판정 칸은 여기서 채우지 않는다 — 이 함수는 후처리만 본다.
   * 단계별 시간(`stageMs`)도 마찬가지다. 그건 한 바퀴 전체를 아는 자리에서 한 번에 채운다 —
   * 단계마다 자기 칸만 채워 올리면 나머지 칸을 0 으로 메우게 되고, 그 0 이 "안 돌았다"로 읽힌다.
   */
  usage: Omit<
    IngestReport["usage"],
    | "topicCalls"
    | "topicInputTokens"
    | "topicOutputTokens"
    | "stageMs"
    | "hotIssueCalls"
    | "hotIssueInputTokens"
    | "hotIssueOutputTokens"
    | "keywordCalls"
    | "keywordInputTokens"
    | "keywordOutputTokens"
    | "models"
  >;
  /** 소스별 요약·번역 토큰 (2026-08-17) — 후보가 들고 온 sourceId 로 접는다. */
  usageBySource: IngestReport["enrichUsageBySource"];
}> {
  // 실패는 세지 않고 **적는다**. `failed` 는 목록 길이에서 나오므로 둘이 어긋날 수 없다.
  const summaries = {
    attempted: 0,
    succeeded: 0,
    skippedNoEvidence: 0,
    failedTitles: [] as string[],
    failureReasons: [] as string[],
    error: null as string | null,
  };
  const titles = {
    attempted: 0,
    succeeded: 0,
    failedTitles: [] as string[],
    failureReasons: [] as string[],
    error: null as string | null,
  };
  const usage = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    maxInputTokens: 0,
  };
  // 소스별 요약·번역 토큰(2026-08-17). 후처리는 소스 경계 없이 전체 풀 하나를 도는데,
  // 각 후보가 sourceId 를 들고 있어 여기서 접을 수 있다.
  const usageBySource: IngestReport["enrichUsageBySource"] = {};
  const addUsageBySource = (sourceId: string, inputTokens: number, outputTokens: number) => {
    const acc = usageBySource[sourceId] ?? { inputTokens: 0, outputTokens: 0 };
    usageBySource[sourceId] = {
      inputTokens: acc.inputTokens + inputTokens,
      outputTokens: acc.outputTokens + outputTokens,
    };
  };
  // `usage` 뒤에 둔다 — 위에 두면 이른 return 이 하나 생기는 날 ReferenceError 로
  // 수집 한 바퀴가 통째로 죽는다(이 함수는 던지지 않는 것이 전제다).
  const done = () => ({
    summaries: { ...summaries, failed: summaries.failedTitles.length },
    titles: { ...titles, failed: titles.failedTitles.length },
    usage,
    usageBySource,
  });

  let candidates;
  try {
    candidates = await ports.listEnrichCandidates();
    // 받아 온 수가 풀 상한과 같으면 **더 있는데 못 본 것**이다. 건수 상한을 없앤 뒤로
    // 한 바퀴가 보는 전부가 이 풀이라, 여기서 잘리면 예산은 하나도 안 썼는데 일은 남는다
    // (INV-CB10). 표시를 안 하면 그 상태가 「다 했다」와 같은 모양이 된다.
    if (candidates.length >= ENRICH_POOL) budget.poolTruncated = true;
  } catch (e) {
    // 이 단계가 통째로 죽어도 이미 끝난 적재는 유효하다.
    const error = errorText(e);
    const r = done();
    return { ...r, summaries: { ...r.summaries, error }, titles: { ...r.titles, error } };
  }

  for (const [index, item] of candidates.entries()) {
    // 예산이 떨어지면 멈춘다 (runExtraction 과 같은 이유). 후보는 점수순이라
    // 남는 것은 항상 **점수가 낮은 쪽**이고, 다음 주기에 다시 잡힌다.
    // 멈추는 이유가 둘이다 (runExtraction 과 같은 자리).
    //   시간 (INV-CB9): 요약 한 건의 최악치(30초)보다 적게 남았으면 시작하지 않는다.
    //   요금 (INV-CB8·CB7): 상한에 닿으면 **모델을 부르기 전에** 멈춘다. 요약이 밀려도
    //     카드에는 출처 요약글이 남아 화면이 틀리지는 않는다.
    // 후보는 점수순이라 남는 것은 항상 **점수가 낮은 쪽**이고, 다음 호출에 다시 잡힌다.
    if (!budget.canAfford(WORST_CASE_MS.enrich) || meter.capped()) {
      budget.skippedEnrichments += candidates.length - index;
      break;
    }

    // 조건을 여기서 다시 판정한다. 조회 계층이 골라 준 것을 그대로 믿으면 그 필터를 지워도
    // 아무 테스트가 안 깨진다 — 규칙이 우리 코드에 없는 셈이 된다.
    const evidence = item.contentHtml.trim() || (item.sourceExcerpt ?? "").trim();
    const summaryMissing = (item.summary ?? "").trim() === "";
    const needTitle = (item.titleKo ?? "").trim() === "";
    const needSummary = summaryMissing && evidence !== "";

    // 근거가 없어 요약을 포기한 건 실패와 따로 센다 — 재시도해도 소용없다 (INV-S3).
    if (summaryMissing && evidence === "") summaries.skippedNoEvidence += 1;
    if (!needSummary && !needTitle) continue;

    if (needSummary) summaries.attempted += 1;
    if (needTitle) titles.attempted += 1;

    // "만들었다"이지 "저장했다"가 아니다 — 저장은 뒤에서 실패할 수 있다.
    let summaryReady = false;
    let titleReady = false;
    // 공식 근거는 요약·번역과 따로 센다. 요약이 비어도 이 판정만으로 저장할 값이 생긴다.
    let officialReady = false;
    // 빈 값으로 이미 실패를 센 것을 기억한다 — 저장이 그 뒤에 죽어도 두 번 세지 않는다.
    let summaryCounted = false;
    let titleCounted = false;
    try {
      const out = await ports.enrich({
        title: item.title,
        evidence,
        needSummary,
        needTitle,
      });

      // 결과를 어떻게 쓰든 먼저 센다 — 아래에서 빈 요약으로 실패 처리되는 호출도
      // 요금은 나갔다. 여기가 아니라 성공 분기에서 세면 "실패에만 돈이 나간 주기"가 안 보인다.
      usage.calls += 1;
      usage.inputTokens += out.usage.inputTokens;
      usage.outputTokens += out.usage.outputTokens;
      usage.cacheReadTokens += out.usage.cacheReadTokens;
      usage.cacheWriteTokens += out.usage.cacheWriteTokens;
      usage.maxInputTokens = Math.max(usage.maxInputTokens, out.usage.inputTokens);
      addUsageBySource(item.sourceId, out.usage.inputTokens, out.usage.outputTokens);
      // 이번 바퀴 지출에 바로 더한다 (INV-CB7) — 다음 건을 시작하기 전에 상한을 다시 본다.
      meter.add(ENRICH_MODEL, out.usage.inputTokens, out.usage.outputTokens);

      const patch: {
        summary?: string;
        points?: string[];
        tags?: string[];
        titleKo?: string;
        officialBasis?: OfficialBasis;
      } = {};

      if (needSummary) {
        // 빈 요약을 저장하면 다음 주기의 재시도 조건에서 빠져나가 영영 요약 없는 항목이 된다.
        const text = out.summary.trim();
        if (text === "") {
          summaries.failedTitles.push(item.title);
          summaryCounted = true;
        } else {
          patch.summary = text;
          patch.points = out.points;
          summaryReady = true;
        }
      }
      if (needTitle) {
        const ko = (out.titleKo ?? "").trim();
        if (ko === "") {
          titles.failedTitles.push(item.title);
          titleCounted = true;
        } else {
          patch.titleKo = ko;
          titleReady = true;
        }
      }

      // INV-O2: 근거는 올라가기만 한다 — 전이 규칙 자체는 entities 에 있다(nextOfficialBasis).
      //
      // **요약이 나온 항목에만 쓴다.** 같은 근거를 주고도 요약을 못 만든 응답의 공식 판단은
      // 믿을 이유가 약하고, 안 쓰면 그 항목은 요약이 비어 있어 다음 주기에 다시 잡힌다 —
      // 잃는 것이 없다. (`summaryReady` 안에 두면 needSummary 도 자동으로 만족된다:
      // 근거 없이 번역만 하는 항목에는 공식 지시 자체가 안 실린다 — INV-P1.)
      if (summaryReady) {
        const next = nextOfficialBasis(item.officialBasis, out.officialByContent);
        if (next !== item.officialBasis) {
          patch.officialBasis = next;
          officialReady = true;
        }
      }

      // 저장할 게 없으면 부르지 않는다 — 빈 update 는 왕복만 늘린다.
      if (!summaryReady && !titleReady && !officialReady) continue;
      await ports.saveEnrichment(item.id, patch);
      if (summaryReady) summaries.succeeded += 1;
      if (titleReady) titles.succeeded += 1;
    } catch (e) {
      // 저장하지 않는다 — 비어 있어야 다음 주기에 다시 잡힌다 (INV-S2).
      // 이미 빈 값으로 실패를 센 쪽은 두 번 세지 않는다.
      if (needSummary && !summaryCounted) {
        summaries.failedTitles.push(item.title);
        noteFailure(summaries.failureReasons, e);
      }
      if (needTitle && !titleCounted) {
        titles.failedTitles.push(item.title);
        noteFailure(titles.failureReasons, e);
      }
    }
  }

  return done();
}

export async function runIngest(params: {
  sources: readonly Source[];
  ports: IngestPorts;
  now: Date;
  /** 한 바퀴에 쓸 수 있는 시간. 기본값은 budgets.ts. */
  budgetMs?: number;
  /** 흐르는 시계. 기본은 `Date.now`. 테스트만 바꾼다. */
  monotonicNow?: () => number;
  /**
   * 이번 실행의 식별자. 적재하는 항목마다 함께 저장돼(`last_ingest_run_id`), 소스별
   * 대시보드가 "이번 실행이 가져온 글"을 골라낼 수 있게 한다(2026-08-17). 기본은 무작위 생성 —
   * 호출하는 쪽(route.ts)이 저장한 리포트와 맞춰 볼 필요가 있을 때만 명시로 준다.
   */
  runId?: string;
}): Promise<IngestReport> {
  const {
    sources,
    ports,
    now,
    budgetMs = INGEST_BUDGET_MS,
    monotonicNow = () => Date.now(),
    runId = crypto.randomUUID(),
  } = params;

  const deadline = monotonicNow() + budgetMs;
  const budget: Budget = {
    exhausted: () => monotonicNow() >= deadline,
    canAfford: (ms) => monotonicNow() + ms <= deadline,
    skippedSources: [],
    skippedTopicChecks: 0,
    skippedExtractions: 0,
    skippedEnrichments: 0,
    skippedKeywords: false,
    skippedHotIssue: false,
    poolTruncated: false,
  };

  const timing: Timing = {
    now: monotonicNow,
    ms: {
      feedMs: 0,
      topicMs: 0,
      storeMs: 0,
      hotIssueMs: 0,
      extractionMs: 0,
      enrichmentMs: 0,
      keywordsMs: 0,
    },
  };

  // 오늘(KST) 지금까지 쓴 돈을 **저장된 실행 기록에서** 읽는다 (INV-CB6).
  // 호출과 호출 사이에 숫자를 넘겨받지 않는다 — 넘겨받으면 체인이 한 번 끊길 때마다
  // 0 부터 다시 시작해서, 상한이 있는데도 하루에 몇 번이고 상한만큼 쓸 수 있다.
  //
  // **조회가 실패하면 상한에 닿은 것으로 본다.** 실패를 0 으로 보면 그 순간 상한이
  // 사라지는데, 그게 바로 이 조항이 막으려던 상태다("상한이 있는데 안 걸린다").
  // 반대로 틀리면 그날 요약·키워드가 밀릴 뿐이고, 밀린 글은 다음 호출에 다시 잡힌다.
  // 어느 쪽으로 틀렸는지는 리포트의 `cost.lookupFailed` 가 말한다.
  let baseSpendUsd = 0;
  let lookupFailed = false;
  try {
    baseSpendUsd = await ports.loadTodaySpendUsd(now);
  } catch {
    lookupFailed = true;
  }
  const meter = createCostMeter({
    baseUsd: lookupFailed ? DAILY_COST_CAP_USD : baseSpendUsd,
  });

  const reports: SourceReport[] = [];
  const topicUsage: TopicUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  for (const source of sources) {
    // 예산이 떨어지면 남은 소스는 손대지 않는다. **건너뛴 것은 반드시 남긴다** —
    // 안 남기면 뒤쪽 소스가 매일 0건인 것이 "그 소스에 새 글이 없다"로 보인다.
    if (budget.exhausted()) {
      budget.skippedSources.push(source.id);
      continue;
    }
    // 소스마다 독립 실행 (INV-C4). 하나가 죽어도 루프는 계속 돈다.
    const result = await ingestSource(source, ports, now, budget, timing, runId, meter);
    reports.push(result.report);
    topicUsage.calls += result.topicUsage.calls;
    topicUsage.inputTokens += result.topicUsage.inputTokens;
    topicUsage.outputTokens += result.topicUsage.outputTokens;
  }

  // 순서가 규칙이다:
  //   주제 선별 → 적재 → **핫이슈 판정** → 본문 추출 → 후처리(요약·번역) → 뱃지 키워드.
  // 추출이 요약보다 앞인 이유는 그대로다 — 이번 주기에 채운 본문이 곧바로 요약 근거가 된다.
  //
  // **핫이슈가 적재 바로 다음인 이유** (2026-09-20 사용자 결정): 이 판정은 그날 무엇을
  // 볼지를 정하는 값이라 밀리면 화면의 구획이 통째로 빈다. 요약은 밀려도 카드에 출처
  // 요약글이 남아서 글자가 있다. 예산이 모자란 날 무엇이 먼저 밀리나를 이 순서가 정한다.
  //
  // 대가를 적어 둔다: 추출보다 앞이라 **이번 주기에 새로 들어온 글은 본문 없이 판정된다**
  // (근거가 출처 요약글뿐이다). 지난 주기에 본문이 채워진 글은 본문을 쓴다. 스펙이
  // "제목 + 출처 요약글 + (있으면) 본문"으로 적은 그대로다 — AI 요약을 기다리지 않는다.
  //
  // **요금 상한은 이 단계를 멈추지 않는다** (INV-CB8): 판정이 멈추면 그날 들어온 글이
  // 전부 조용히 「소식」으로 간다 — 판정을 못 받은 글이 서는 자리가 거기다. 화면은
  // 멀쩡해 보이는데 내용이 틀린다. 시간(INV-CB9)으로만 끊는다.
  const hotIssue = !budget.canAfford(WORST_CASE_MS.hotIssue)
    ? null
    : await measure(timing, "hotIssueMs", () =>
        runHotIssue(ports, {
          limit: HOT_ISSUE_BATCH,
          concurrency: HOT_ISSUE_CONCURRENCY,
          now,
          exhausted: () => !budget.canAfford(WORST_CASE_MS.hotIssue),
        }));
  if (hotIssue === null) budget.skippedHotIssue = true;
  // 이번 바퀴 지출에 더한다 — 아래 단계들이 상한을 볼 때 이 돈이 세어져 있어야 한다.
  if (hotIssue !== null) {
    meter.add(HOT_ISSUE_MODEL, hotIssue.usage.inputTokens, hotIssue.usage.outputTokens);
  }

  const extraction = await runExtraction(ports, budget, timing, meter);
  const { summaries, titles, usage, usageBySource: enrichUsageBySource } = await measure(
    timing,
    "enrichmentMs",
    () => runEnrichment(ports, budget, meter),
  );

  // 키워드가 **맨 뒤**인 이유: 근거로 출처 요약글과 본문을 쓰므로 추출 뒤여야 한다.
  // 예산이 떨어졌으면 통째로 건너뛴다 — 밀린 글은 `keywords_at` 이 비어 있어 다음 주기에
  // 그대로 다시 잡힌다. 이 단계는 던지지 않으므로 리포트는 항상 돌아온다.
  //
  // **예산 판정을 안으로도 넘긴다.** 여기 한 번만 보면 그 순간 통과한 뒤로 최악 150초를
  // 더 쓰고(청크 10개 × 타임아웃 15초) Vercel 300초를 넘긴다 — 넘기면 응답 본문이 없어
  // 이 리포트가 통째로 사라진다. 중간에 멈춘 건수는 `keywords.skipped` 로 돌아온다.
  //
  // **요금 상한에도 멈춘다** (INV-CB8). 키워드가 밀리면 뱃지 줄이 그만큼 비지만,
  // 화면이 **틀리지는** 않는다 — 가르는 기준은 "요약이냐"가 아니라 "멈추면 화면이
  // 틀리느냐"다. 상한은 비정상을 끊는 장치라 그때는 최대한 멈추는 쪽이 맞다.
  const keywords =
    !budget.canAfford(WORST_CASE_MS.keywords) || meter.capped()
      ? null
      : await measure(timing, "keywordsMs", () =>
        runKeywords(ports, {
          limit: KEYWORD_BATCH,
          concurrency: KEYWORD_CONCURRENCY,
          exhausted: () => !budget.canAfford(WORST_CASE_MS.keywords) || meter.capped(),
        }));
  // `skippedKeywords` 는 **통째로 안 돌린 경우**만 참이다. 중간에 멈춘 건수는
  // `keywords.skipped` 가 따로 나른다 — 둘을 한 칸에 섞으면 "예산이 아예 없었다"와
  // "80건 중 24건에서 멈췄다"가 리포트에서 같은 모양이 된다.
  if (keywords === null) budget.skippedKeywords = true;
  if (keywords !== null) {
    meter.add(KEYWORD_MODEL, keywords.usage.inputTokens, keywords.usage.outputTokens);
  }

  return {
    keywords,
    hotIssue,
    // 상한에 걸렸다는 것과 **그때의 합계**를 남긴다 (INV-CB8). 안 남기면 리포트에서
    // "그날 글이 없었다"와 "상한에 걸렸다"가 같은 모양이 된다.
    cost: {
      capUsd: meter.capUsd,
      spentUsd: meter.spentUsd(),
      capped: meter.capped(),
      lookupFailed,
    },
    sources: reports,
    failedSources: reports.filter((r) => r.error !== null).map((r) => r.sourceId),
    topicFilter: mergeTopicFilterReports(reports.map((r) => r.topicFilter)),
    extraction,
    summaries,
    titles,
    usage: {
      ...usage,
      topicCalls: topicUsage.calls,
      topicInputTokens: topicUsage.inputTokens,
      topicOutputTokens: topicUsage.outputTokens,
      // 핫이슈·키워드 토큰은 각 단계 리포트 안에 있다. 여기로 옮겨 담아야 저장되는
      // `usage` 에 실리고, 화면이 네 단계의 요금을 다 보여줄 수 있다 (2026-09-22).
      // 단계를 못 돌렸으면(null) 0 이다 — 안 돌았으니 토큰도 안 썼다.
      hotIssueCalls: hotIssue?.usage.calls ?? 0,
      hotIssueInputTokens: hotIssue?.usage.inputTokens ?? 0,
      hotIssueOutputTokens: hotIssue?.usage.outputTokens ?? 0,
      keywordCalls: keywords?.usage.calls ?? 0,
      keywordInputTokens: keywords?.usage.inputTokens ?? 0,
      keywordOutputTokens: keywords?.usage.outputTokens ?? 0,
      // 이 실행이 실제로 부른 모델. 코드의 지금 값으로 옛 실행을 계산하면 모델을 바꾼 날
      // 과거 요금이 소급해서 바뀌고, "바꾸고 얼마나 줄었나"를 볼 수 없게 된다.
      models: {
        topic: TOPIC_MODEL,
        hotIssue: HOT_ISSUE_MODEL,
        enrich: ENRICH_MODEL,
        keywords: KEYWORD_MODEL,
      },
      // 소수점은 버린다 — 단계 하나가 몇 밀리초인지는 결정에 안 쓰이고, 저장되는 값이
      // 실행마다 미세하게 달라지면 리포트를 눈으로 비교할 수 없다.
      stageMs: {
        feedMs: Math.round(timing.ms.feedMs),
        topicMs: Math.round(timing.ms.topicMs),
        storeMs: Math.round(timing.ms.storeMs),
        hotIssueMs: Math.round(timing.ms.hotIssueMs),
        extractionMs: Math.round(timing.ms.extractionMs),
        enrichmentMs: Math.round(timing.ms.enrichmentMs),
        keywordsMs: Math.round(timing.ms.keywordsMs),
      },
    },
    enrichUsageBySource,
    budget: {
      // 무엇 하나라도 건너뛰었으면 참이다. 시각만 남기면 읽는 사람이 계산해야 한다.
      exhausted:
        budget.skippedSources.length > 0 ||
        budget.skippedTopicChecks > 0 ||
        budget.skippedExtractions > 0 ||
        budget.skippedEnrichments > 0 ||
        budget.skippedKeywords ||
        budget.skippedHotIssue ||
        budget.poolTruncated,
      skippedSources: budget.skippedSources,
      skippedTopicChecks: budget.skippedTopicChecks,
      skippedExtractions: budget.skippedExtractions,
      skippedEnrichments: budget.skippedEnrichments,
      skippedKeywords: budget.skippedKeywords,
      skippedHotIssue: budget.skippedHotIssue,
      // 단계 **안에서** 멈춘 건수. 단계 리포트가 이미 세고 있는 값을 여기로 옮겨 온다 —
      // 이어달리기 판정(INV-CB10)이 한자리에서 「무엇이 안 끝났나」를 보기 위해서다.
      skippedKeywordItems: keywords?.skipped ?? 0,
      skippedHotIssueItems: hotIssue?.skipped ?? 0,
      poolTruncated: budget.poolTruncated,
    },
  };
}
