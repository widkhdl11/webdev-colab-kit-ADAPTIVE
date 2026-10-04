import type { NextRequest } from "next/server";
import { setCreatorVerified } from "@/features/admin-creator-verify/model/set-creator-verified";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 본인 확인 승인·취소 (admin-console INV-K1·K10). 운영자가 아니면 404.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누가 했는지 DB 가 그 토큰의 사람으로 기록한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => setCreatorVerified(await createRequestSupabase(), body));
}
