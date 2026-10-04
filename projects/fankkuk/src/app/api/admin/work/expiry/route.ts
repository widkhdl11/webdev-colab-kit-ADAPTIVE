import type { NextRequest } from "next/server";
import { runExpiry } from "@/features/office-expiry-run/model/run-expiry";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 7일 자동 처리 지금 돌리기 (office-workflow INV-W6). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다. 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 되어 아무나 돌린다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => runExpiry(await createRequestSupabase(), body));
}
