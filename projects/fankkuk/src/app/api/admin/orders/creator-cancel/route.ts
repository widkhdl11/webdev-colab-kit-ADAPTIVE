import type { NextRequest } from "next/server";
import { cancelForCreator } from "@/features/admin-order-cancel/model/cancel-for-creator";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 사정으로 취소 (payment INV-M21). 운영자가 아니면 404, 직원 운영자는 403, 취소할 수 있는 주문이 아니면 409.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 대표 판정과 기록의 「누가」는 DB 가 그 토큰의 사람으로 한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => cancelForCreator(await createRequestSupabase(), body));
}
