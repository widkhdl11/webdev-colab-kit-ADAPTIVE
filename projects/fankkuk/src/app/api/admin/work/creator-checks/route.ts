import type { NextRequest } from "next/server";
import { processCreatorCheck } from "@/features/admin-creator-check/model/process-check";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터가 고른 블루투스 상자의 운영자 처리(office-workflow INV-W13). 운영자가 아니면 404.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 되어 아무나 처리한다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => processCreatorCheck(await createRequestSupabase(), body));
}
