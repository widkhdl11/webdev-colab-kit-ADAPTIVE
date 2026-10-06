import type { NextRequest } from "next/server";
import { prepareDifference } from "@/features/difference-pay/model/prepare-difference";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 차액 결제 준비 (payment INV-M11·M13). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 상자인지는 DB 가 로그인 토큰으로 판정한다(관리자 키 금지).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => prepareDifference(await createRequestSupabase(), body));
}
