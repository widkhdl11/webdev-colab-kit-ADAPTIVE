import type { NextRequest } from "next/server";
import { submitInquiry } from "@/features/inquiry-submit/model/submit-inquiry";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 1:1 문의 남기기 (admin-console INV-K11, 결정 d25). 같은 사이트의 JSON 요청만, 응답은 저장하지 않는다(no-store).
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 쓴 사람은 DB 가 그 토큰의 사람으로 기록한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => submitInquiry(await createRequestSupabase(), body));
}
