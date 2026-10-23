import type { NextRequest } from "next/server";
import { markManualRefund } from "@/features/admin-refund/model/mark-manual-refund";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 「직접 환불함」 (admin-console INV-K7 S7d·S7e). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인한 사람의 세션 클라이언트만 쓴다 — 대표인지는 DB 가 그 토큰의 사람으로 판정한다. 결제사는 부르지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => markManualRefund({ session: await createRequestSupabase() }, body));
}
