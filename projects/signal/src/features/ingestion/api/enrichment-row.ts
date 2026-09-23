import type { IngestPorts } from "../lib/ports";

type EnrichmentPatch = Parameters<IngestPorts["saveEnrichment"]>[1];

/**
 * 후처리 결과를 `item` update 한 줄로 옮긴다.
 *
 * `ports.ts` 에서 떼어 낸 이유: 그 파일은 `server-only` 라 유닛이 불러오지도 못한다. 거기 있는 동안은
 * 저장할 칸 한 줄을 지워도 전 스위트가 통과했다 — 핫이슈 저장(`hot-issue-db.ts`)을 같은 이유로 뗐다.
 *
 * **주지 않은 필드는 건드리지 않는다** — 번역만 성공한 항목의 summary 를 덮으면 재시도 신호(비어 있음)가
 * 사라진다 (INV-S3).
 */
export function toEnrichmentRow(patch: EnrichmentPatch, nowIso: string): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: nowIso };
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.points !== undefined) row.summary_points = patch.points;
  // 새 형식의 칸 (INV-S8, 0011). 요약을 저장할 때만 같이 온다 — 번역만 한 항목은 안 건드린다.
  if (patch.oneLine !== undefined) row.one_line = patch.oneLine;
  if (patch.table !== undefined) row.summary_table = patch.table;
  if (patch.titleKo !== undefined) row.title_ko = patch.titleKo;
  // 파이프라인이 "덮어도 되는 경우"에만 실어 보낸다 (INV-O2) — 여기서 다시 판단하지 않는다.
  if (patch.officialBasis !== undefined) row.official_basis = patch.officialBasis;
  // 요약 불합격 횟수 (INV-S3 S32, 0011). 이 줄이 빠지면 한도가 영영 안 차 같은 글에 매 주기 요금이 나간다.
  if (patch.summaryFailures !== undefined) row.summary_failures = patch.summaryFailures;
  return row;
}
