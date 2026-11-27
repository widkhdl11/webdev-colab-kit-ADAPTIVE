import type { NextRequest } from "next/server";
import { withdrawAccount } from "@/features/admin-account-withdraw/model/withdraw-account";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";
import { removeWithdrawnPhotos } from "@/features/account-withdraw-self/api/withdrawn-photos";

// 회원 탈퇴 처리 (my-account INV-A15). 운영자가 아니면 404, 직원은 403, 없는 회원 404, 진행 중인 일·끝나지 않은 환불이 있으면 409.
// DB 는 로그인한 대표의 세션 클라이언트로 부른다(대표 판정·기록의 「누가」). 관리자 키는 처리가 끝난 뒤 공개 저장소의 사진을 지울 때만 쓴다(withdrawn-photos —
// 본인 탈퇴 /api/me/withdraw 와 같이 쓴다).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => withdrawAccount(await createRequestSupabase(), removeWithdrawnPhotos, body));
}
