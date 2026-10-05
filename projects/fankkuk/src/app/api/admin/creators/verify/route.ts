import type { NextRequest } from "next/server";
import { decideCreatorVerification } from "@/features/admin-creator-verify/model/decide-creator-verification";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 운영자의 본인 확인 처리 — 승인·반려·승인 취소·횟수 풀기 (creator-verification INV-V6·V9·V10·V15, admin-console INV-K1·K10).
// 운영자가 아니면 404. 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누가 했는지 DB 가 그 토큰의 사람으로 기록한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => decideCreatorVerification(await createRequestSupabase(), body));
}
