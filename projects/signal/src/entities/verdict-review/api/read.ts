import type { SupabaseClient } from "@supabase/supabase-js";
import { ITEM_COLUMNS, WEEK_COLUMNS, toReviewItem, toReviewRun, toReviewWeek } from "./row";
import type { ReviewItem, ReviewRun, ReviewWeek } from "../model/types";

/**
 * 판정 검토 읽기 — 클라이언트를 받는다. `server-only` 가 없는 이유: 통합 테스트가 실제 DB 로 부른다
 * (features/ingestion/api/hot-issue-db.ts 와 같은 처리). 앱은 ./review-queries.ts(server-only, secret 키)로만 쓴다.
 * 판정 검토 테이블은 공개 정책이 없다(0012, INV-VR9) — 공개 키 클라이언트로는 아무것도 안 돌아온다.
 */

/**
 * 모양이 틀린 행을 **조용히 버리지 않고 실패한다.** 표본 행이 하나 빠지면 「전부 답함」이 참이 되어 주가
 * 검토됨으로 잘못 닫히고, 닫힌 주가 빠지면 정확도·수정안 표시가 조용히 꺼진다. (2026-09-24 테스트 감사)
 */
function parseAll<T>(rows: readonly unknown[], parse: (r: unknown) => T | null, what: string): T[] {
  const out = rows.map(parse);
  const bad = out.filter((x) => x === null).length;
  if (bad > 0) throw new Error(`판정 검토 ${what} 행 ${bad}개의 모양이 틀리다 — 마이그레이션과 코드의 칸 이름을 맞춰 본다`);
  return out as T[];
}

/** 최근 주들(최신이 앞). */
export async function readReviewWeeks(db: SupabaseClient, limit: number): Promise<ReviewWeek[]> {
  const { data, error } = await db.from("verdict_review_week").select(WEEK_COLUMNS).order("week", { ascending: false }).limit(limit);
  if (error) throw new Error(`판정 검토 주 조회 실패: ${error.message}`);
  return parseAll(data ?? [], toReviewWeek, "주");
}

/** 주 하나. 없으면 null. */
export async function readReviewWeek(db: SupabaseClient, week: string): Promise<ReviewWeek | null> {
  const { data, error } = await db.from("verdict_review_week").select(WEEK_COLUMNS).eq("week", week).maybeSingle();
  if (error) throw new Error(`판정 검토 주 조회 실패: ${error.message}`);
  return data === null ? null : (parseAll([data], toReviewWeek, "주")[0] ?? null);
}

export async function readReviewItems(db: SupabaseClient, week: string): Promise<ReviewItem[]> {
  const { data, error } = await db.from("verdict_review_item").select(ITEM_COLUMNS).eq("week", week).order("position", { ascending: true });
  if (error) throw new Error(`판정 검토 표본 조회 실패: ${error.message}`);
  return parseAll(data ?? [], toReviewItem, "표본");
}

/** 마지막 실행 기록 (INV-VR8). */
export async function readLastReviewRun(db: SupabaseClient): Promise<ReviewRun | null> {
  const { data, error } = await db.from("verdict_review_run").select("ran_at, ok, message").order("ran_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`판정 검토 실행 기록 조회 실패: ${error.message}`);
  return data === null ? null : toReviewRun(data);
}
