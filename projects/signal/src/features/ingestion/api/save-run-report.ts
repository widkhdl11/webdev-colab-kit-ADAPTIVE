// 대시보드용 기록만 하는 자리라 server-only (INV-S4 와 같은 경계 — secret 키로 쓴다).
import "server-only";

import { serverSupabase } from "@/shared/api/supabase-server";
// entities/ingest-run 이 정의한 저장 모양을 그대로 쓴다 — 여기서 따로 인터페이스를
// 다시 선언하면 이름·필드가 두 곳에서 갈릴 수 있고, 어긋나도 컴파일은 통과한다
// (row.ts 의 zod 파싱만 실행 시점에 조용히 "실행 없음"으로 떨어뜨린다). 2026-08-17 리뷰.
import type { IngestRunBudget, IngestRunSourceStat, IngestRunUsage } from "@/entities/ingest-run";
import type { IngestReport } from "../lib/ports";

/**
 * 소스별로 저장할 통계 (2026-08-17).
 *
 * `topicFilter`(걸러진 개수·제목)는 `IngestReport.sources[].topicFilter` 에 이미 있다.
 * `extractionFailed` 만 따로 계산해서 넣는다 — 본문 추출은 소스 루프가 끝난 뒤 전체
 * 후보를 한 번에 돌기 때문에(runExtraction), 실패한 항목이 어느 소스 것인지는 파이프라인이
 * 모른다. 실패한 주소로 item 을 되짚어야 알 수 있다.
 */

/** 실패한 원문 주소를 소스로 되짚는다. 실패가 없으면 조회 자체를 안 한다. */
async function extractionFailedBySource(
  db: ReturnType<typeof serverSupabase>,
  failedUrls: string[],
): Promise<Map<string, number>> {
  const bySource = new Map<string, number>();
  if (failedUrls.length === 0) return bySource;

  const { data, error } = await db
    .from("item")
    .select("source_id, original_url")
    .in("original_url", failedUrls);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const sourceId = row.source_id as string;
    bySource.set(sourceId, (bySource.get(sourceId) ?? 0) + 1);
  }
  return bySource;
}

/**
 * 실행 하나의 리포트를 `ingest_run` 에 남긴다 — 개발자용 파이프라인 대시보드가 읽는 값.
 *
 * **불변식이 아니다.** 이 저장이 실패해도 수집 자체는 이미 끝났으니, 부르는 쪽(route.ts)이
 * 이 함수를 던지게 두고 자신은 계속 200 을 돌려줘야 한다 — 관측이 죽었다고 Cron 까지
 * 실패로 보이면 안 된다.
 */
export async function saveIngestRunReport(params: {
  runId: string;
  startedAt: Date;
  elapsedMs: number;
  report: IngestReport;
}): Promise<void> {
  const { runId, startedAt, elapsedMs, report } = params;
  const db = serverSupabase();

  const failedBySource = await extractionFailedBySource(db, report.extraction.failedUrls);

  const sources: IngestRunSourceStat[] = report.sources.map((s) => {
    // 주제판정 토큰은 소스가 직접 들고 있고(topicUsage), 요약·번역 토큰은 후처리가
    // 소스 경계 없이 전체 풀 하나를 돌면서 sourceId 별로 접어 온 것이다(enrichUsageBySource) —
    // 둘을 합쳐야 그 소스가 이번 실행에서 실제로 쓴 토큰 전체가 된다.
    const enrichUsage = report.enrichUsageBySource[s.sourceId];
    const tokensUsed =
      s.topicUsage.inputTokens +
      s.topicUsage.outputTokens +
      (enrichUsage?.inputTokens ?? 0) +
      (enrichUsage?.outputTokens ?? 0);
    return {
      sourceId: s.sourceId,
      fetched: s.fetched,
      stored: s.stored,
      dropped: s.dropped,
      error: s.error,
      filtered: s.topicFilter.filtered,
      filteredTitles: s.topicFilter.filteredTitles,
      extractionFailed: failedBySource.get(s.sourceId) ?? 0,
      tokensUsed,
    };
  });

  // 요약·번역 후보 풀은 이번 실행에서 새로 가져온 소스로 한정되지 않는다 — 예산이
  // 떨어져 건너뛴 소스의 밀린 글도 후처리 대상에 섞여 들어올 수 있다. 그런 소스는
  // report.sources 에 아예 없어서 위 map 에서 빠지는데, 그 토큰 지출을 조용히
  // 버리면 표의 "토큰" 합계가 상단 "추정 비용"보다 작아지고 이유를 알 수 없다.
  const trackedSourceIds = new Set(sources.map((s) => s.sourceId));
  for (const [sourceId, enrichUsage] of Object.entries(report.enrichUsageBySource)) {
    if (trackedSourceIds.has(sourceId)) continue;
    sources.push({
      sourceId,
      fetched: 0,
      stored: 0,
      dropped: 0,
      error: null,
      filtered: 0,
      filteredTitles: [],
      extractionFailed: failedBySource.get(sourceId) ?? 0,
      tokensUsed: enrichUsage.inputTokens + enrichUsage.outputTokens,
    });
  }
  const usage: IngestRunUsage = report.usage;
  const budget: IngestRunBudget = report.budget;

  const { error } = await db.from("ingest_run").insert({
    id: runId,
    started_at: startedAt.toISOString(),
    elapsed_ms: elapsedMs,
    usage,
    sources,
    budget,
  });
  if (error) throw new Error(error.message);
}
