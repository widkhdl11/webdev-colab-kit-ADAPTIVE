import type { NextRequest } from "next/server";
import { savePricing } from "@/features/admin-pricing-edit/model/save-pricing";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 요금표 저장 (admin-console INV-K2·K4·K5). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 요금 변경 함수를 부른다 — 대표인지는 DB 가 그 토큰의 사람으로 판정한다.
// 관리자 키를 쓰지 않는다: 쓰면 DB 의 대표 판정이 서버 계정 기준이 되어 직원도 저장된다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => savePricing(await createRequestSupabase(), body));
}
