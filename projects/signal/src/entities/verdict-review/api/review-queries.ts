// 판정 검토 테이블은 공개 정책이 없다(0012, INV-VR9) — secret 키로만 읽힌다.
// 이 파일은 배럴에서 내보내지 않는다(INV-S4 와 같은 이유: 배럴은 클라이언트로 갈 수 있는 자리다).
import "server-only";

import { serverSupabase } from "@/shared/api/supabase-server";
import { readLastReviewRun, readReviewItems, readReviewWeek, readReviewWeeks } from "./read";
import type { ReviewItem, ReviewRun, ReviewWeek } from "../model/types";

export function fetchReviewWeeks(limit = 12): Promise<ReviewWeek[]> {
  return readReviewWeeks(serverSupabase(), limit);
}

export function fetchReviewWeek(week: string): Promise<ReviewWeek | null> {
  return readReviewWeek(serverSupabase(), week);
}

export function fetchReviewItems(week: string): Promise<ReviewItem[]> {
  return readReviewItems(serverSupabase(), week);
}

export async function fetchReviewRuns(): Promise<{ last: ReviewRun | null }> {
  return { last: await readLastReviewRun(serverSupabase()) };
}
