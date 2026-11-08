import type { NextRequest } from "next/server";
import { saveBoxServiceFees } from "@/features/admin-pricing-edit/model/save-box-service-fees";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 서비스료(정가·초기 크리에이터) 저장 (revgift-box INV-GB13~GB15, admin-console INV-K2). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 대표인지는 DB 가 그 토큰의 사람으로 판정한다(관리자 키 금지, ../route.ts 와 같다).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => saveBoxServiceFees(await createRequestSupabase(), body));
}
