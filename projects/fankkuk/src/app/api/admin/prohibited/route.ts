import type { NextRequest } from "next/server";
import { saveProhibited } from "@/features/admin-prohibited-edit/model/save-prohibited";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 보낼 수 없는 물품 추가·고치기·지우기 (admin-console INV-K1·K9). 몸통의 kind 로 셋을 가른다.
// 운영자가 아니면(손님 포함) 404 — 판정은 saveProhibited 가 DB 판정 함수로 한다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다. 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 되어 아무나 바꾼다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => saveProhibited(await createRequestSupabase(), body));
}
