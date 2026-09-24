import type { SupabaseClient } from "@supabase/supabase-js";
import { toSnapshotRow, toSummaryRow } from "@/entities/verdict-review";
import { readReviewItems, readReviewWeek, readReviewWeeks } from "@/entities/verdict-review/api/read";
import type { AnswerError, ReviewStore } from "./review-store";

/**
 * 판정 검토의 DB 저장소 — 클라이언트를 받는다. `server-only` 가 없는 이유: 통합 테스트가 실제 DB 로
 * 부른다(features/ingestion/api/hot-issue-db.ts 와 같은 처리). 앱은 ./supabase-store.ts(server-only,
 * secret 키)로만 만든다. 판정 검토 테이블은 공개 정책이 없다(0012, INV-VR9).
 */

const CANDIDATE_COLUMNS =
  "id, title, title_ko, source_id, source_name, original_url, gate, hot_issue_at, hot_issue_answers, hot_issue_reasons, one_line, summary_points";

const ANSWER_ERRORS: readonly AnswerError[] = ["no_week", "closed", "no_item", "bad_answer", "bad_direction"];

export function createReviewDb(db: SupabaseClient): ReviewStore {
  return {
    // 닫힘 판정과 연속 오류는 최근 몇 달이면 충분하다. 상한이 없으면 이 조회가 해마다 길어진다.
    listWeeks: () => readReviewWeeks(db, 60),
    weekItems: (week) => readReviewItems(db, week),
    week: (week) => readReviewWeek(db, week),

    async sampledItemIds(candidateIds) {
      // 전체 표본 id 를 읽지 않는다 — API 의 최대 행 수(1000)가 먼저 걸려 1년쯤 뒤부터 일부만 온다.
      // 이번 후보 중 이미 뽑힌 것만 물으면 된다. `in` 목록이 URL 에 실리므로 나눠서 묻는다.
      const seen = new Set<string>();
      const CHUNK = 150;
      for (let i = 0; i < candidateIds.length; i += CHUNK) {
        const { data, error } = await db
          .from("verdict_review_item")
          .select("item_id")
          .in("item_id", candidateIds.slice(i, i + CHUNK));
        if (error) throw new Error(`표본 id 조회 실패: ${error.message}`);
        for (const r of data ?? []) seen.add(String(r.item_id));
      }
      return seen;
    },

    async candidateRows(sinceIso, untilIso) {
      const rows: unknown[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("item")
          .select(CANDIDATE_COLUMNS)
          .gte("hot_issue_at", sinceIso)
          .lte("hot_issue_at", untilIso)
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`후보 조회 실패: ${error.message}`);
        rows.push(...(data ?? []));
        if ((data ?? []).length < PAGE) return rows;
      }
    },

    async createWeek(input) {
      // 주와 표본을 DB 함수 하나가 한 트랜잭션에서 넣는다 — 중간에 멈춰도 표본 0건인 주가 안 남는다.
      // 그 주가 이미 있으면 false(아무것도 안 바꿈, INV-VR2).
      const { data, error } = await db.rpc("create_verdict_week", {
        p_week: input.week,
        p_extracted_at: input.extractedAt,
        p_seed: input.seed,
        p_pool_size: input.poolSize,
        p_shortfall: { hot: input.shortfall.hot, not_hot: input.shortfall.notHot },
        p_items: input.items.map((c, i) => ({
          item_id: c.itemId,
          position: i + 1,
          hot: c.hot,
          snapshot: toSnapshotRow(c.snapshot),
        })),
      });
      if (error) throw new Error(`주 만들기 실패: ${error.message}`);
      return data === true;
    },

    async markClosing(week) {
      const { error } = await db
        .from("verdict_review_week")
        .update({ closing_at: new Date().toISOString() })
        .eq("week", week)
        .is("closing_at", null);
      if (error) throw new Error(`닫힘 표지 실패: ${error.message}`);
    },

    async closeWeek(week, status, summary, closedAt) {
      const { error } = await db
        .from("verdict_review_week")
        .update({ status, closed_at: closedAt, summary: toSummaryRow(summary) })
        .eq("week", week)
        .is("status", null);
      if (error) throw new Error(`주 닫기 실패: ${error.message}`);
    },

    async logRun(ok, message) {
      const { error } = await db.from("verdict_review_run").insert({ ok, message: message.slice(0, 300) });
      if (error) throw new Error(`실행 기록 실패: ${error.message}`);
    },

    async answer(week, itemId, answer, direction) {
      const { data, error } = await db.rpc("answer_verdict_item", {
        p_week: week,
        p_item: itemId,
        p_answer: answer,
        p_direction: direction,
      });
      if (error) throw new Error(`답 저장 실패: ${error.message}`);
      const res = data as { ok?: unknown; error?: unknown } | null;
      if (res?.ok === true) return { ok: true };
      const code = ANSWER_ERRORS.find((e) => e === res?.error);
      return { ok: false, error: code ?? "bad_input" };
    },
  };
}
