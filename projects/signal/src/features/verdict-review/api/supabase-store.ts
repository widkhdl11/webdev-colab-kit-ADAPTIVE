// 판정 검토 테이블은 공개 정책이 없다(0012, INV-VR9) — secret 키로만 읽고 쓴다.
import "server-only";

import { serverSupabase } from "@/shared/api/supabase-server";
import { createReviewDb } from "./review-db";
import type { ReviewStore } from "./review-store";

/** 앱이 쓰는 판정 검토 저장소 — secret 키 클라이언트. */
export function createReviewStore(): ReviewStore {
  return createReviewDb(serverSupabase());
}
