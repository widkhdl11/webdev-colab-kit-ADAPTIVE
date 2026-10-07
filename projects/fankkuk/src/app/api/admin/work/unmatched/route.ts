import type { NextRequest } from "next/server";
import { returnHeld } from "@/features/admin-held-return/model/return-held";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 운영자 확인 목록의 「반송으로 넘기기」 (inbound-address-code INV-C6·C9). 운영자가 아니면 404.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다. 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 되어 아무나 처리한다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => returnHeld(await createRequestSupabase(), body));
}
