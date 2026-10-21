import type { NextRequest } from "next/server";
import { adminStorageRequest } from "@/features/admin-storage/model/admin-storage";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 운영자 물품 보관소(inbound-address-code INV-C13·C12 ③) — 몸통의 kind 로 확인 요청 목록(claims) · 입고 처리(accept) · 주인 아님(reject) ·
// 포장 모양 수정(look) · 전화번호 뒤 4자리 검색(phone_search). 운영자가 아니면 404.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다. 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 되어 아무나 처리한다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => adminStorageRequest(await createRequestSupabase(), body));
}
