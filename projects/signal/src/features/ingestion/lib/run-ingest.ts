import { nextOfficialBasis, parseFeedItem } from "@/entities/article";
import type { FeedItemDraft, OfficialBasis } from "@/entities/article";
import { SUBJECT_SITES } from "@/entities/source";
import type { Source } from "@/entities/source";
import type { IngestPorts, IngestReport, SourceReport, TopicFilterReport } from "./ports";

/**
 * 수집 한 바퀴 — ingestion-ranking INV-C4·S2·S3 강제 지점.
 *
 * 규칙 하나로 요약하면 **어디서 실패해도 나머지는 간다**. 이 함수는 던지지 않는다.
 * 던지면 Cron 한 번이 통째로 날아가고, 다음 주기까지 피드가 안 갱신된다.
 */

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
/** 주제 판정이 쓴 토큰. 요약과 합치지 않는다 — 합치면 어느 쪽이 튀는지 안 보인다. */
export interface TopicUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

async function filterByTopic(
  items: FeedItemDraft[],
  ports: IngestPorts,
): Promise<{ kept: FeedItemDraft[]; report: TopicFilterReport; usage: TopicUsage }> {
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

  for (const item of items) {
    if (known.has(item.canonicalUrl)) {
      // 판정은 건너뛰지만 적재는 한다 — 본문·출처 요약글이 새로 올 수 있다.
      alreadyKnown += 1;
      kept.push(item);
      continue;
    }

    attempted += 1;
    let onTopic: boolean;
    try {
      const verdict = await ports.judgeTopic(item.title);
      onTopic = verdict.onTopic;
      // 실패한 호출에도 요금은 나갔지만 그건 예외 경로라 토큰을 받을 길이 없다.
      // 성공한 호출만이라도 세면 "판정에 얼마나 쓰는가"는 보인다.
      usage.calls += 1;
      usage.inputTokens += verdict.usage.inputTokens;
      usage.outputTokens += verdict.usage.outputTokens;
    } catch {
      onTopic = true; // INV-F3: 판정이 실패하면 거르지 않는다.
      failedOpen += 1;
    }
    if (onTopic) kept.push(item);
    else filteredTitles.push(item.title);
  }

  return {
    kept,
    usage,
    report: {
      attempted,
      alreadyKnown,
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
      filtered: acc.filtered + r.filtered,
      filteredTitles: [...acc.filteredTitles, ...r.filteredTitles],
      failedOpen: acc.failedOpen + r.failedOpen,
    }),
    { attempted: 0, alreadyKnown: 0, filtered: 0, filteredTitles: [] as string[], failedOpen: 0 },
  );
}

async function ingestSource(
  source: Source,
  ports: IngestPorts,
  now: Date,
): Promise<{ report: SourceReport; topicFilter: TopicFilterReport; topicUsage: TopicUsage }> {
  const base = { sourceId: source.id, fetched: 0, stored: 0, dropped: 0 };
  // try 바깥에 둔다 — 적재가 던져도 **이미 한 판정은 리포트에 남아야 한다**(INV-F2).
  // 안에 두면 하필 DB 가 흔들린 주기에 "무엇을 걸렀나"가 통째로 사라진다. 호출은 이미 나갔다.
  let topicFilter: TopicFilterReport = {
    attempted: 0,
    alreadyKnown: 0,
    filtered: 0,
    filteredTitles: [],
    failedOpen: 0,
  };
  // 토큰도 같은 이유로 try 바깥이다 — 적재가 죽어도 이미 쓴 돈은 보고서에 남아야 한다.
  let topicUsage: TopicUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const raw = await ports.fetchFeed(source);
    const drafts = raw
      .map((item) =>
        parseFeedItem(item, {
          fetchedAt: now,
          sourceId: source.id,
          sourceName: source.name,
          subjectSites: SUBJECT_SITES,
        }),
      )
      .filter((d): d is FeedItemDraft => d !== null);

    // 최신 것부터 상한까지만. 자르기 전에 중복을 접어야 "중복 두 건 때문에 한 건 밀림"이 안 생긴다.
    const unique = dedupeByCanonicalUrl(drafts)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, MAX_ITEMS_PER_SOURCE);

    const filtered = await filterByTopic(unique, ports);
    topicFilter = filtered.report;
    topicUsage = filtered.usage;
    const { kept } = filtered;

    // 넣을 게 없으면 부르지 않는다 — 빈 upsert 로 실패 위험만 늘릴 이유가 없다.
    if (kept.length > 0) await ports.upsertItems(kept);

    return {
      report: {
        ...base,
        fetched: raw.length,
        stored: kept.length,
        dropped: raw.length - drafts.length,
        error: null,
      },
      topicFilter,
      topicUsage,
    };
  } catch (e) {
    // 적재 실패도 여기서 잡는다. 네트워크만 감싸면 DB 오류 하나가 전체를 세운다.
    return { report: { ...base, error: errorText(e) }, topicFilter, topicUsage };
  }
}

/**
 * 본문이 없는 항목의 본문을 원문에서 뽑는다 (INV-S5).
 *
 * 요약보다 **먼저** 돈다: 여기서 채워진 본문이 곧 요약의 근거가 되기 때문이다.
 * 실패는 항목 단위로 격리한다 — OpenAI 원문은 403 이고(2026-08-09 실측) 그건 정상 경로다.
 */
async function runExtraction(ports: IngestPorts): Promise<IngestReport["extraction"]> {
  // 실패는 세지 않고 **적는다** — 건수는 목록 길이에서 나온다(둘이 갈리면 보고서가 조용히 틀린다).
  const failedUrls: string[] = [];
  const result = { attempted: 0, succeeded: 0, error: null as string | null };
  const done = () => ({ ...result, failed: failedUrls.length, failedUrls });

  let candidates;
  try {
    candidates = await ports.listExtractionCandidates();
  } catch (e) {
    return { ...done(), error: errorText(e) };
  }

  for (const item of candidates) {
    result.attempted += 1;
    try {
      const html = await ports.extractContent(item.url);
      // 빈 본문을 저장하면 다음 주기에 후보에서 빠지지 않고 계속 재시도된다 —
      // 그건 맞다(사이트가 고쳐질 수 있다). 다만 저장할 것은 없다.
      if (html.trim() === "") {
        failedUrls.push(item.url);
        continue;
      }
      await ports.saveContent(item.id, html);
      result.succeeded += 1;
    } catch {
      failedUrls.push(item.url);
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
async function runEnrichment(ports: IngestPorts): Promise<{
  summaries: IngestReport["summaries"];
  titles: IngestReport["titles"];
  /** 주제 판정 칸은 여기서 채우지 않는다 — 이 함수는 후처리만 본다. */
  usage: Omit<IngestReport["usage"], "topicCalls" | "topicInputTokens" | "topicOutputTokens">;
}> {
  // 실패는 세지 않고 **적는다**. `failed` 는 목록 길이에서 나오므로 둘이 어긋날 수 없다.
  const summaries = {
    attempted: 0,
    succeeded: 0,
    skippedNoEvidence: 0,
    failedTitles: [] as string[],
    error: null as string | null,
  };
  const titles = {
    attempted: 0,
    succeeded: 0,
    failedTitles: [] as string[],
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
  // `usage` 뒤에 둔다 — 위에 두면 이른 return 이 하나 생기는 날 ReferenceError 로
  // 수집 한 바퀴가 통째로 죽는다(이 함수는 던지지 않는 것이 전제다).
  const done = () => ({
    summaries: { ...summaries, failed: summaries.failedTitles.length },
    titles: { ...titles, failed: titles.failedTitles.length },
    usage,
  });

  let candidates;
  try {
    candidates = await ports.listEnrichCandidates();
  } catch (e) {
    // 이 단계가 통째로 죽어도 이미 끝난 적재는 유효하다.
    const error = errorText(e);
    const r = done();
    return { ...r, summaries: { ...r.summaries, error }, titles: { ...r.titles, error } };
  }

  for (const item of candidates) {
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
          patch.tags = out.tags;
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
    } catch {
      // 저장하지 않는다 — 비어 있어야 다음 주기에 다시 잡힌다 (INV-S2).
      // 이미 빈 값으로 실패를 센 쪽은 두 번 세지 않는다.
      if (needSummary && !summaryCounted) summaries.failedTitles.push(item.title);
      if (needTitle && !titleCounted) titles.failedTitles.push(item.title);
    }
  }

  return done();
}

export async function runIngest(params: {
  sources: readonly Source[];
  ports: IngestPorts;
  now: Date;
}): Promise<IngestReport> {
  const { sources, ports, now } = params;

  const reports: SourceReport[] = [];
  const topicFilterReports: TopicFilterReport[] = [];
  const topicUsage: TopicUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  for (const source of sources) {
    // 소스마다 독립 실행 (INV-C4). 하나가 죽어도 루프는 계속 돈다.
    const result = await ingestSource(source, ports, now);
    reports.push(result.report);
    topicFilterReports.push(result.topicFilter);
    topicUsage.calls += result.topicUsage.calls;
    topicUsage.inputTokens += result.topicUsage.inputTokens;
    topicUsage.outputTokens += result.topicUsage.outputTokens;
  }

  // 순서가 규칙이다: 주제 선별 → 적재 → 본문 추출 → 후처리(요약·번역).
  // 추출이 앞이어야 이번 주기에 채운 본문이 곧바로 요약 근거가 된다.
  const extraction = await runExtraction(ports);
  const { summaries, titles, usage } = await runEnrichment(ports);

  return {
    sources: reports,
    failedSources: reports.filter((r) => r.error !== null).map((r) => r.sourceId),
    topicFilter: mergeTopicFilterReports(topicFilterReports),
    extraction,
    summaries,
    titles,
    usage: {
      ...usage,
      topicCalls: topicUsage.calls,
      topicInputTokens: topicUsage.inputTokens,
      topicOutputTokens: topicUsage.outputTokens,
    },
  };
}
