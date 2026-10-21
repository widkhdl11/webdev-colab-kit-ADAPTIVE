import type { NextRequest } from "next/server";
import { prepareResume } from "@/features/checkout/model/resume-payment";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 결제 이어 하기 준비 (payment INV-M22). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 주문인지·24시간 전인지는 DB 가 로그인 토큰으로 판정한다(관리자 키 금지).
// 브라우저는 주문번호만 보낸다. 금액은 DB 가 처음 결제 대기에 저장한 값을 돌려준다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => prepareResume(await createRequestSupabase(), body));
}
