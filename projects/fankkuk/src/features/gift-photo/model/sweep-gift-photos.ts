import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { GIFT_PHOTO_BUCKET } from "./save-gift-photo";

// 끝난 주문의 선물 사진 정리 (together INV-F2 — 팬이 보지도 지우지도 못하는 사진을 남기지 않는다).
// 취소·결제 실패·결제 없이 24시간이 지난 주문의 사진 기록은 DB 가 지우고, 그렇게 지운 기록과 주문 줄을 지울 때 같이 사라진 기록의
// 파일 경로는 DB 의 지울 목록에 쌓인다(sweep_gift_photos). 여기서 그 경로를 서버 키로 저장소에서 지우고 목록에서 뺀다.
// 저장소에서 지우지 못하면 목록에서 빼지 않고 던진다 — 다음 예약 실행이 다시 지운다. 예약 실행(api/cron/payments)이 5분마다 부른다.

/** 한 번에 지우는 파일 수 — 남은 것은 다음 회차가 지운다. */
export const SWEEP_BATCH = 100;

export type SweepResult = { removed: number };

const pathsSchema = z.array(z.object({ path: z.string().min(1) }).strict());

export async function sweepGiftPhotos(admin: Pick<SupabaseClient, "rpc" | "storage">, batch = SWEEP_BATCH): Promise<SweepResult> {
  const swept = await admin.rpc("sweep_gift_photos", { p_limit: batch });
  if (swept.error) throw new Error(`지울 사진을 읽지 못했다: ${swept.error.code}`);
  const paths = pathsSchema.parse(swept.data).map((r) => r.path);
  if (paths.length === 0) return { removed: 0 };
  const removed = await admin.storage.from(GIFT_PHOTO_BUCKET).remove(paths);
  if (removed.error) throw new Error("저장소에서 사진을 지우지 못했다");
  const done = await admin.rpc("gift_photo_trash_done", { p_paths: paths });
  if (done.error) throw new Error(`지운 사진을 목록에서 빼지 못했다: ${done.error.code}`);
  return { removed: paths.length };
}
