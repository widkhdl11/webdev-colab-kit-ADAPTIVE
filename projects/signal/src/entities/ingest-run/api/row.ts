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
  // 단계별 소요 시간 (2026-09-22). **옛 행에는 없다** — 이 칸이 생기기 전에 쌓인 실행이
  // 1,800건 있고, 필수로 두면 그 행들이 전부 파싱에 걸려 화면이 "실행 없음"으로 떨어진다.
  stageMs: z
    .object({
      feedMs: z.number(),
      topicMs: z.number(),
      storeMs: z.number(),
      hotIssueMs: z.number(),
      extractionMs: z.number(),
      enrichmentMs: z.number(),
      keywordsMs: z.number(),
    })
    .nullish(),
  // 2026-09-22 에 생긴 칸들. 옛 행에는 없다 — 필수로 두면 1,800개 넘는 옛 행이
  // 전부 파싱에 걸려 화면이 "실행 없음"으로 떨어진다.
  hotIssueCalls: z.number().nullish(),
  hotIssueInputTokens: z.number().nullish(),
  hotIssueOutputTokens: z.number().nullish(),
  keywordCalls: z.number().nullish(),
  keywordInputTokens: z.number().nullish(),
  keywordOutputTokens: z.number().nullish(),
  models: z
    .object({
      topic: z.string(),
      hotIssue: z.string(),
      enrich: z.string(),
      keywords: z.string(),
    })
    .nullish(),
});

const budgetSchema = z.object({
  exhausted: z.boolean(),
  skippedSources: z.array(z.string()),
  skippedTopicChecks: z.number(),
  skippedExtractions: z.number(),
  skippedEnrichments: z.number(),
  // 이 둘이 빠져 있어서 **키워드 단계가 3주간 통째로 안 돌아간 것이 화면 어디에도 안 떴다**
  // (2026-09-22). 리포트에는 처음부터 있었고 여기서 안 읽었을 뿐이다.
  // 옛 행에는 없을 수 있어 `nullish` 다 — 위 stageMs 와 같은 이유.
  skippedKeywords: z.boolean().nullish(),
  skippedHotIssue: z.boolean().nullish(),
});

/**
 * 요금 상한 판정 (INV-CB8). 옛 행에는 칸 자체가 없어서 `nullish` 다 —
 * 위 `stageMs` 와 같은 이유이고, 없는 것은 아래에서 `null` 로 못 박는다.
 */
const costSchema = z.object({
  capUsd: z.number(),
  spentUsd: z.number(),
  capped: z.boolean(),
  lookupFailed: z.boolean(),
});

const rowSchema = z.object({
  id: z.string().min(1),
  started_at: z.string().min(1),
  elapsed_ms: z.number(),
  usage: usageSchema,
  sources: z.array(sourceStatSchema),
  budget: budgetSchema,
  cost: costSchema.nullish(),
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
    // 없는 칸은 **`null` 로 못 박는다.** `undefined` 로 두면 화면이 "값이 없다"와
    // "이 실행에는 그 칸이 아예 없었다"를 같은 것으로 보게 되고, 옛 행과 새 행이 섞인
    // 목록에서 그 차이가 그대로 사라진다.
    cost: r.cost ?? null,
    budget: {
      ...r.budget,
      skippedKeywords: r.budget.skippedKeywords ?? null,
      skippedHotIssue: r.budget.skippedHotIssue ?? null,
    },
    usage: {
      ...r.usage,
      stageMs: r.usage.stageMs ?? null,
      hotIssueCalls: r.usage.hotIssueCalls ?? null,
      hotIssueInputTokens: r.usage.hotIssueInputTokens ?? null,
      hotIssueOutputTokens: r.usage.hotIssueOutputTokens ?? null,
      keywordCalls: r.usage.keywordCalls ?? null,
      keywordInputTokens: r.usage.keywordInputTokens ?? null,
      keywordOutputTokens: r.usage.keywordOutputTokens ?? null,
      models: r.usage.models ?? null,
    },
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
