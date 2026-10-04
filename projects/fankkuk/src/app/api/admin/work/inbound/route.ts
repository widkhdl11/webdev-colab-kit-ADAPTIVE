import type { NextRequest } from "next/server";
import { scanInbound } from "@/features/office-inbound/model/scan-inbound";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 입고 스캔·라벨 부착 확인·미확인 입고 기록 (office-workflow INV-W1·W2·W5). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다. 관리자 키를 쓰면 DB 의 운영자·작업자 판정이 서버 계정 기준이 되어 아무나 처리한다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => scanInbound(await createRequestSupabase(), body));
}
