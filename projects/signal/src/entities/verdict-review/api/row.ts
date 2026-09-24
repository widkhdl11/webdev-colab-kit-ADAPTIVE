import { z } from "zod";
import type { ReviewItem, ReviewRun, ReviewSnapshot, ReviewWeek, WeekSummary } from "../model/types";

/**
 * 조회 응답 → 도메인 모양. **신뢰 경계다** (rules/supabase). 모양이 틀린 행은 버린다 —
 * 화면이 `undefined` 를 그리는 것보다 그 행이 안 보이는 편이 낫다.
 * DB 의 snake_case 와 jsonb 안의 칸 이름을 여기서만 안다.
 */

const snapshotSchema = z.object({
  title: z.string(),
  source: z.string(),
  source_name: z.string(),
  url: z.string().nullable(),
  judged_at: z.string(),
  true_questions: z.array(z.string()),
  reasons: z.record(z.string()),
  one_line: z.string().nullable(),
  points: z.array(z.string()),
});

export type SnapshotRow = z.infer<typeof snapshotSchema>;

export function toSnapshotRow(s: ReviewSnapshot): SnapshotRow {
  return {
    title: s.title,
    source: s.source,
    source_name: s.sourceName,
    url: s.url,
    judged_at: s.judgedAt,
    true_questions: s.trueQuestions,
    reasons: s.reasons,
    one_line: s.oneLine,
    points: s.points,
  };
}

const itemSchema = z.object({
  item_id: z.string().min(1),
  position: z.number().int(),
  hot: z.boolean(),
  snapshot: snapshotSchema,
  answer: z.enum(["correct", "wrong", "unsure"]).nullable(),
  direction: z.enum(["should_be_hot", "should_not_be_hot", "wrong_reason", "unknown"]).nullable(),
  answered_at: z.string().nullable(),
});

export function toReviewItem(row: unknown): ReviewItem | null {
  const r = itemSchema.safeParse(row);
  if (!r.success) return null;
  const d = r.data;
  return {
    itemId: d.item_id,
    position: d.position,
    hot: d.hot,
    snapshot: {
      title: d.snapshot.title,
      source: d.snapshot.source,
      sourceName: d.snapshot.source_name,
      url: d.snapshot.url,
      judgedAt: d.snapshot.judged_at,
      trueQuestions: d.snapshot.true_questions,
      reasons: d.snapshot.reasons,
      oneLine: d.snapshot.one_line,
      points: d.snapshot.points,
    },
    answer: d.answer,
    direction: d.direction,
    answeredAt: d.answered_at,
  };
}

const summarySchema = z.object({
  total: z.number(),
  answered: z.number(),
  correct: z.number(),
  wrong: z.number(),
  unsure: z.number(),
  accuracy: z.number().nullable(),
  by_direction: z.record(z.number()),
  by_question: z.record(z.number()),
  by_source: z.record(z.number()),
  kinds: z.record(z.number()),
  answer_minutes: z.number().nullable(),
});

export function toSummaryRow(s: WeekSummary): z.infer<typeof summarySchema> {
  return {
    total: s.total,
    answered: s.answered,
    correct: s.correct,
    wrong: s.wrong,
    unsure: s.unsure,
    accuracy: s.accuracy,
    by_direction: s.byDirection,
    by_question: s.byQuestion,
    by_source: s.bySource,
    kinds: s.kinds,
    answer_minutes: s.answerMinutes,
  };
}

const weekSchema = z.object({
  week: z.string().min(1),
  extracted_at: z.string(),
  pool_size: z.number().int(),
  shortfall: z.object({ hot: z.number(), not_hot: z.number() }),
  first_answer_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  closing_at: z.string().nullable(),
  status: z.enum(["reviewed", "unreviewed"]).nullable(),
  closed_at: z.string().nullable(),
  summary: summarySchema.nullable(),
});

export const WEEK_COLUMNS =
  "week, extracted_at, pool_size, shortfall, first_answer_at, completed_at, closing_at, status, closed_at, summary";
export const ITEM_COLUMNS = "item_id, position, hot, snapshot, answer, direction, answered_at";

export function toReviewWeek(row: unknown): ReviewWeek | null {
  const r = weekSchema.safeParse(row);
  if (!r.success) return null;
  const d = r.data;
  const s = d.summary;
  return {
    week: d.week,
    extractedAt: d.extracted_at,
    poolSize: d.pool_size,
    shortfall: { hot: d.shortfall.hot, notHot: d.shortfall.not_hot },
    firstAnswerAt: d.first_answer_at,
    completedAt: d.completed_at,
    closingAt: d.closing_at,
    status: d.status,
    closedAt: d.closed_at,
    summary:
      s === null
        ? null
        : {
            total: s.total,
            answered: s.answered,
            correct: s.correct,
            wrong: s.wrong,
            unsure: s.unsure,
            accuracy: s.accuracy,
            byDirection: s.by_direction,
            byQuestion: s.by_question,
            bySource: s.by_source,
            kinds: s.kinds,
            answerMinutes: s.answer_minutes,
          },
  };
}

const runSchema = z.object({ ran_at: z.string(), ok: z.boolean(), message: z.string() });

export function toReviewRun(row: unknown): ReviewRun | null {
  const r = runSchema.safeParse(row);
  return r.success ? { ranAt: r.data.ran_at, ok: r.data.ok, message: r.data.message } : null;
}
