import type { NextRequest } from "next/server";
import { FAN_PHOTO_BUCKET } from "@/entities/fan/model/fan-profile";
import { PHOTO_BUCKET } from "@/entities/creator/model/link-images";
import { withdrawAccount, type RemovePhotos } from "@/features/admin-account-withdraw/model/withdraw-account";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 회원 탈퇴 처리 (my-account INV-A15). 운영자가 아니면 404, 직원은 403, 없는 회원 404, 진행 중인 일·끝나지 않은 환불이 있으면 409.
// DB 는 로그인한 대표의 세션 클라이언트로 부른다(대표 판정·기록의 「누가」). 관리자 키는 처리가 끝난 뒤 공개 저장소의 사진을 지울 때만 쓴다.
const removePhotos: RemovePhotos = async ({ fan, creator }) => {
  const storage = createAdminSupabase().storage;
  const results = await Promise.all([
    fan.length ? storage.from(FAN_PHOTO_BUCKET).remove(fan) : null,
    creator.length ? storage.from(PHOTO_BUCKET).remove(creator) : null,
  ]);
  return results.every((r) => r === null || r.error === null);
};

export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => withdrawAccount(await createRequestSupabase(), removePhotos, body));
}
