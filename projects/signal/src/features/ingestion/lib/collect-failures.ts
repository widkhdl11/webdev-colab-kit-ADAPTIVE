import type { IngestRunFailure, IngestRunFailureStage } from "@/entities/ingest-run";
import type { IngestReport } from "./ports";

/**
 * 리포트에 흩어진 실패 이유를 저장할 한 목록으로 모은다 (2026-09-27, 0013).
 *
 * 단계마다 `failureReasons`(한 건씩 난 실패, 서로 다른 것만)와 `error`(단계가 통째로 죽음)가
 * 따로 있다. 저장할 때 이걸 버려서 API 요금이 떨어진 날도 대시보드엔 "0건"으로만 보였다.
 * 단계의 시도·실패 건수를 같이 담는다 — 한 건 실패와 전부 실패를 읽는 쪽이 가를 수 있게.
 *
 * 단계 안의 한 건 실패도 전부 담는다 — 한 단계라도 실패하면 그날은 실패다(2026-09-27 사용자 지시).
 * 소스별 실패(피드 받기·적재)는 담지 않는다 — `sources[].error` 가 이미 들고 있다.
 */
export function collectFailures(report: IngestReport): IngestRunFailure[] {
  const out: IngestRunFailure[] = [];
  const add = (
    stage: IngestRunFailureStage,
    counts: { attempted: number; failed: number },
    reasons: readonly string[],
    error: string | null,
  ) => {
    const entries = [
      ...(error === null ? [] : [{ reason: error, whole: true }]),
      ...reasons.map((reason) => ({ reason, whole: false })),
    ];
    // 실패 건수는 있는데 이유를 안 남기는 경로가 있다(요약 형식 불합격 등). 이유가 없다고 빠지면
    // 그 단계의 실패가 화면에서 사라진다 — 빈 이유로 한 줄 담는다.
    if (entries.length === 0 && counts.failed > 0) entries.push({ reason: "", whole: false });
    for (const { reason, whole } of entries) {
      if (out.some((f) => f.stage === stage && f.reason === reason)) continue;
      out.push({ stage, reason, whole, attempted: counts.attempted, failed: counts.failed });
    }
  };

  const tf = report.topicFilter;
  add("topic", { attempted: tf.attempted, failed: tf.failedOpen }, tf.failureReasons, null);
  const hi = report.hotIssue;
  if (hi !== null) add("hotIssue", hi, hi.failureReasons, hi.error);
  add("extraction", report.extraction, report.extraction.failureReasons, report.extraction.error);
  add("summary", report.summaries, report.summaries.failureReasons, report.summaries.error);
  add("title", report.titles, report.titles.failureReasons, report.titles.error);
  const kw = report.keywords;
  if (kw !== null) add("keywords", kw, kw.failureReasons, kw.error);
  return out;
}
