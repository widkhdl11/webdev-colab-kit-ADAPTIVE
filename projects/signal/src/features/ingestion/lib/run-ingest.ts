import { parseFeedItem } from "@/entities/article";
import type { FeedItemDraft } from "@/entities/article";
import type { Source } from "@/entities/source";
import type { IngestPorts, IngestReport, SourceReport } from "./ports";

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

async function ingestSource(
  source: Source,
  ports: IngestPorts,
  now: Date,
): Promise<SourceReport> {
  const base = { sourceId: source.id, fetched: 0, stored: 0, dropped: 0 };
  try {
    const raw = await ports.fetchFeed(source);
    const drafts = raw
      .map((item) =>
        parseFeedItem(item, {
          fetchedAt: now,
          sourceId: source.id,
          sourceName: source.name,
        }),
      )
      .filter((d): d is FeedItemDraft => d !== null);

    // 최신 것부터 상한까지만. 자르기 전에 중복을 접어야 "중복 두 건 때문에 한 건 밀림"이 안 생긴다.
    const unique = dedupeByCanonicalUrl(drafts)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, MAX_ITEMS_PER_SOURCE);

    // 넣을 게 없으면 부르지 않는다 — 빈 upsert 로 실패 위험만 늘릴 이유가 없다.
    if (unique.length > 0) await ports.upsertItems(unique);

    return {
      ...base,
      fetched: raw.length,
      stored: unique.length,
      dropped: raw.length - drafts.length,
      error: null,
    };
  } catch (e) {
    // 적재 실패도 여기서 잡는다. 네트워크만 감싸면 DB 오류 하나가 전체를 세운다.
    return { ...base, error: errorText(e) };
  }
}

/**
 * 본문이 없는 항목의 본문을 원문에서 뽑는다 (INV-S5).
 *
 * 요약보다 **먼저** 돈다: 여기서 채워진 본문이 곧 요약의 근거가 되기 때문이다.
 * 실패는 항목 단위로 격리한다 — OpenAI 원문은 403 이고(2026-08-09 실측) 그건 정상 경로다.
 */
async function runExtraction(ports: IngestPorts): Promise<IngestReport["extraction"]> {
  const result = { attempted: 0, succeeded: 0, failed: 0, error: null as string | null };

  let candidates;
  try {
    candidates = await ports.listExtractionCandidates();
  } catch (e) {
    return { ...result, error: errorText(e) };
  }

  for (const item of candidates) {
    result.attempted += 1;
    try {
      const html = await ports.extractContent(item.url);
      // 빈 본문을 저장하면 다음 주기에 후보에서 빠지지 않고 계속 재시도된다 —
      // 그건 맞다(사이트가 고쳐질 수 있다). 다만 저장할 것은 없다.
      if (html.trim() === "") {
        result.failed += 1;
        continue;
      }
      await ports.saveContent(item.id, html);
      result.succeeded += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
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
): Promise<Pick<IngestReport, "summaries" | "titles">> {
  const summaries = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skippedNoEvidence: 0,
    error: null as string | null,
  };
  const titles = { attempted: 0, succeeded: 0, failed: 0, error: null as string | null };

  let candidates;
  try {
    candidates = await ports.listEnrichCandidates();
  } catch (e) {
    // 이 단계가 통째로 죽어도 이미 끝난 적재는 유효하다.
    const error = errorText(e);
    return { summaries: { ...summaries, error }, titles: { ...titles, error } };
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

      const patch: {
        summary?: string;
        points?: string[];
        tags?: string[];
        titleKo?: string;
      } = {};

      if (needSummary) {
        // 빈 요약을 저장하면 다음 주기의 재시도 조건에서 빠져나가 영영 요약 없는 항목이 된다.
        const text = out.summary.trim();
        if (text === "") {
          summaries.failed += 1;
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
          titles.failed += 1;
          titleCounted = true;
        } else {
          patch.titleKo = ko;
          titleReady = true;
        }
      }

      // 저장할 게 없으면 부르지 않는다 — 빈 update 는 왕복만 늘린다.
      if (!summaryReady && !titleReady) continue;
      await ports.saveEnrichment(item.id, patch);
      if (summaryReady) summaries.succeeded += 1;
      if (titleReady) titles.succeeded += 1;
    } catch {
      // 저장하지 않는다 — 비어 있어야 다음 주기에 다시 잡힌다 (INV-S2).
      // 이미 빈 값으로 실패를 센 쪽은 두 번 세지 않는다.
      if (needSummary && !summaryCounted) summaries.failed += 1;
      if (needTitle && !titleCounted) titles.failed += 1;
    }
  }

  return { summaries, titles };
}

export async function runIngest(params: {
  sources: readonly Source[];
  ports: IngestPorts;
  now: Date;
}): Promise<IngestReport> {
  const { sources, ports, now } = params;

  const reports: SourceReport[] = [];
  for (const source of sources) {
    // 소스마다 독립 실행 (INV-C4). 하나가 죽어도 루프는 계속 돈다.
    reports.push(await ingestSource(source, ports, now));
  }

  // 순서가 규칙이다: 적재 → 본문 추출 → 후처리(요약·번역).
  // 추출이 앞이어야 이번 주기에 채운 본문이 곧바로 요약 근거가 된다.
  const extraction = await runExtraction(ports);
  const { summaries, titles } = await runEnrichment(ports);

  return {
    sources: reports,
    failedSources: reports.filter((r) => r.error !== null).map((r) => r.sourceId),
    extraction,
    summaries,
    titles,
  };
}
