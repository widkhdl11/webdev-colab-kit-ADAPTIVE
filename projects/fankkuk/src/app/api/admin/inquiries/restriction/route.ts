import type { NextRequest } from "next/server";
import { restrictInquiryAuthor } from "@/features/admin-inquiry-restrict/model/restrict-inquiry-author";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 1:1 문의 제한·풀기 (admin-console INV-K12). 운영자가 아니면 404, 직원 운영자는 403, 이미 그 상태면 409.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 대표 판정과 기록의 「누가」는 DB 가 그 토큰의 사람으로 한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => restrictInquiryAuthor(await createRequestSupabase(), body));
}
