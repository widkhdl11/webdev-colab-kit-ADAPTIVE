import type { NextRequest } from "next/server";
import { scanGiftBox } from "@/features/office-gift-box/model/scan-gift-box";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 입고·실측 (revgift-box INV-GB10·GB12·GB13·GB16). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다(관리자 키 금지 — 기록한 운영자가 서버 계정이 된다).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => scanGiftBox(await createRequestSupabase(), body));
}
