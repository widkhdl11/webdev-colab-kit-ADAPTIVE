import type { NextRequest } from "next/server";
import { saveRefundAccount } from "@/features/refund-account/model/save-refund-account";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬의 환불 계좌 넣기 (payment INV-M25). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 주문인지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => saveRefundAccount({ session: await createRequestSupabase(), env: process.env }, body));
}
