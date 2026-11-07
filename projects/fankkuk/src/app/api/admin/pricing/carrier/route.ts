import type { NextRequest } from "next/server";
import { saveCarrierPricing } from "@/features/admin-pricing-edit/model/save-carrier-pricing";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 경로표·기본 경로·팬에게 보내기 택배비 저장 (admin-console INV-K2·K15·K16). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 대표인지는 DB 가 그 토큰의 사람으로 판정한다(관리자 키 금지, ../route.ts 와 같다).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => saveCarrierPricing(await createRequestSupabase(), body));
}
