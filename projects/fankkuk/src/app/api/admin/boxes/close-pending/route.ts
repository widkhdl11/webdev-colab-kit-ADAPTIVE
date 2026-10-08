import type { NextRequest } from "next/server";
import { closePendingBox } from "@/features/admin-pending-box/model/close-pending-box";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 거절·반려 때 아직 안 온 상자를 대표가 「도착하지 않음」으로 닫는다 (payment INV-M18). 운영자가 아니면 404, 직원 운영자는 403, 닫을 수 없는 상자면 409.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 대표 판정은 DB 가 그 토큰의 사람으로 한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => closePendingBox(await createRequestSupabase(), body));
}
