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

async function runSummaries(ports: IngestPorts): Promise<IngestReport["summaries"]> {
  const result = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skippedNoEvidence: 0,
    error: null as string | null,
  };

  let candidates;
  try {
    candidates = await ports.listSummaryCandidates();
  } catch (e) {
    // 요약 단계가 통째로 죽어도 이미 끝난 적재는 유효하다.
    return { ...result, error: errorText(e) };
  }

  for (const item of candidates) {
    // 재생성 조건을 여기서 다시 판정한다 (INV-S3). 조회 계층이 골라 준 것을 그대로 믿으면
    // 그 필터를 지워도 아무 테스트가 안 깨진다 — 규칙이 우리 코드에 없는 셈이 된다.
    if (item.summary !== null && item.summary.trim() !== "") continue;

    // 근거가 없으면 **부르지 않는다** (INV-S3). 제목만 주면 모델이 지어낸다(INV-S1 위반).
    // 실패와 따로 센다 — 재시도해도 소용없는 것과 다시 해볼 만한 것은 다른 이야기다.
    const evidence = item.contentHtml.trim() || (item.sourceExcerpt ?? "").trim();
    if (evidence === "") {
      result.skippedNoEvidence += 1;
      continue;
    }

    result.attempted += 1;
    try {
      const { summary, tags } = await ports.summarize({ title: item.title, evidence });
      // 빈 요약을 저장하면 다음 주기의 재시도 조건(summary 비어 있음)에서 빠져나가
      // 영영 요약 없는 항목이 된다. 실패로 두고 남긴다.
      if (summary.trim() === "") {
        result.failed += 1;
        continue;
      }
      await ports.saveSummary(item.id, summary, tags);
      result.succeeded += 1;
    } catch {
      // 저장하지 않는다 — summary 가 비어 있어야 다음 주기에 다시 잡힌다 (INV-S2).
      result.failed += 1;
    }
  }

  return result;
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

  // 순서가 규칙이다: 적재 → 본문 추출 → 요약.
  // 추출이 요약보다 앞이어야 이번 주기에 채운 본문이 곧바로 요약 근거가 된다.
  return {
    sources: reports,
    failedSources: reports.filter((r) => r.error !== null).map((r) => r.sourceId),
    extraction: await runExtraction(ports),
    summaries: await runSummaries(ports),
  };
}
