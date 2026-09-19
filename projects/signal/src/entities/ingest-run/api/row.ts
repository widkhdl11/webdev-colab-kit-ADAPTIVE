import { z } from "zod";
import type { IngestRunRecord, RunSourceItem } from "../model/types";

/**
 * 조회 응답 → 도메인 모양. **신뢰 경계다** (rules/supabase — row.ts 와 같은 이유).
 *
 * `usage`·`sources` 는 우리 서버(save-run-report.ts)가 직접 쓴 값이라 남의 입력은 아니지만,
 * 마이그레이션과 코드의 필드 이름이 어긋나면 여기서 걸려야 화면이 조용히 `undefined` 를
 * 그리는 대신 "실행 없음"으로 떨어진다.
 */

const sourceStatSchema = z.object({
  sourceId: z.string().min(1),
  fetched: z.number(),
  stored: z.number(),
  dropped: z.number(),
  error: z.string().nullable(),
  filtered: z.number(),
  filteredTitles: z.array(z.string()),
  extractionFailed: z.number(),
  tokensUsed: z.number(),
});

const usageSchema = z.object({
  calls: z.number(),
  topicCalls: z.number(),
  topicInputTokens: z.number(),
  topicOutputTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  maxInputTokens: z.number(),
});

const budgetSchema = z.object({
  exhausted: z.boolean(),
  skippedSources: z.array(z.string()),
  skippedTopicChecks: z.number(),
  skippedExtractions: z.number(),
  skippedEnrichments: z.number(),
});

const rowSchema = z.object({
  id: z.string().min(1),
  started_at: z.string().min(1),
  elapsed_ms: z.number(),
  usage: usageSchema,
  sources: z.array(sourceStatSchema),
  budget: budgetSchema,
});

/** 못 믿을 행은 버린다(null) — 대시보드가 던지는 대신 "실행 없음"으로 떨어진다. */
export function toIngestRunRecord(raw: unknown): IngestRunRecord | null {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    startedAt: r.started_at,
    elapsedMs: r.elapsed_ms,
    budget: r.budget,
    usage: r.usage,
    sources: r.sources,
  };
}

/**
 * `item` 조회 결과 → RunSourceItem. `title`·`original_url` 은 남의 RSS 가 준 값이라
 * 진짜 신뢰 경계다(위 `IngestRunRecord` 쪽과 다른 이유) — item.ts 의 row.ts 와 같은 규칙.
 */
const runSourceItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  title_ko: z.string().nullable().optional(),
  original_url: z.string(),
  published_at: z.string().min(1),
});

/** 못 믿을 행은 목록에서 버린다 — 행 하나가 이상하다고 드릴다운 전체가 사라지면 안 된다. */
export function toRunSourceItem(raw: unknown): RunSourceItem | null {
  const parsed = runSourceItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    title: r.title,
    titleKo: r.title_ko ?? null,
    originalUrl: r.original_url,
    publishedAt: r.published_at,
  };
}
