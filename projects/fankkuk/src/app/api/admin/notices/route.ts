import type { NextRequest } from "next/server";
import { saveNotice } from "@/features/admin-notice-edit/model/save-notice";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 공지 쓰기·고치기 (admin-console INV-K1·K11). 운영자가 아니면 404.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 쓴 사람은 DB 가 그 토큰의 사람으로 기록한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => saveNotice(await createRequestSupabase(), body));
}
