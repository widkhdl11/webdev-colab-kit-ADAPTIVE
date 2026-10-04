import type { NextRequest } from "next/server";
import { scanInspect } from "@/features/office-inspect/model/scan-inspect";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 검수 — QR 로 불러오기·검수 기록 저장·QR 다시 스캔해 검수 끝 (office-workflow INV-W1·W4). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다(관리자 키 금지 — 담당 운영자 기록이 서버 계정이 된다).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => scanInspect(await createRequestSupabase(), body));
}
