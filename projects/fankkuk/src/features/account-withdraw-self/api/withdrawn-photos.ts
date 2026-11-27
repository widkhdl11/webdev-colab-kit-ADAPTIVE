import "server-only";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { batchesOf, groupRows, removeAndForget, type PhotoStore } from "../model/photo-deletions";

// 탈퇴한 계정의 사진을 공개 저장소에서 지운다(my-account INV-A15 — 공개 저장소라 남으면 누구나 연다).
// 대표용 탈퇴(/api/admin/accounts/withdraw)·본인 탈퇴(/api/me/withdraw, INV-A17)·매일 작업(/api/cron/photo-deletions)이 같이 쓴다.
// 관리자 키는 저장소와 「지울 사진」 표(서버 전용)에만 쓴다 — 탈퇴 처리 자체는 요청한 사람의 세션 클라이언트로 한다.

function adminPhotoStore(): PhotoStore {
  const admin = createAdminSupabase();
  return {
    async remove(bucket, paths) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      return error === null;
    },
    async forget(bucket, paths) {
      const { error } = await admin.from("pending_photo_deletions").delete().eq("bucket", bucket).in("path", paths);
      return error === null;
    },
  };
}

/** 탈퇴 처리가 돌려준 경로를 지운다. 모두 지웠으면 true — 아니면 줄이 남아 매일 작업이 다시 지운다 */
export async function removeWithdrawnPhotos(paths: { fan: string[]; creator: string[] }): Promise<boolean> {
  return removeAndForget(adminPhotoStore(), batchesOf(paths));
}

/** 매일 작업 — 남은 줄을 한 번에 최대 500개 다시 지운다. 남은 줄 수를 돌려준다(못 읽으면 null) */
export async function sweepPendingPhotoDeletions(): Promise<{ tried: number; done: boolean } | null> {
  const { data, error } = await createAdminSupabase().from("pending_photo_deletions").select("bucket, path").order("created_at").limit(500);
  if (error || !Array.isArray(data)) return null;
  const rows = data as { bucket: string; path: string }[];
  return { tried: rows.length, done: await removeAndForget(adminPhotoStore(), groupRows(rows)) };
}
