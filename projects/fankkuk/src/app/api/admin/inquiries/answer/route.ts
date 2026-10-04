import type { NextRequest } from "next/server";
import { answerInquiry } from "@/features/admin-inquiry-answer/model/answer-inquiry";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 1:1 문의 답하기 (admin-console INV-K1·K11). 운영자가 아니면 404, 이미 답한 문의면 409.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 답한 사람은 DB 가 그 토큰의 사람으로 기록한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => answerInquiry(await createRequestSupabase(), body));
}
