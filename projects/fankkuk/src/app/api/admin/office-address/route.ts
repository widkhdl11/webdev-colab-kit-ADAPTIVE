import type { NextRequest } from "next/server";
import { saveOfficeAddress } from "@/features/admin-office-address-edit/model/save-office-address";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬꾹 주소 저장 (admin-console INV-K19). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 대표인지는 DB 가 그 토큰의 사람으로 판정한다(관리자 키 금지).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => saveOfficeAddress(await createRequestSupabase(), body));
}
