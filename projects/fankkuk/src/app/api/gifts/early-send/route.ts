import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { ackEarlySend } from "@/features/box-waybill/model/early-send";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 「먼저 보내기」(approval-signature INV-S9) — 승인 전 주문의 받는 주소를 열기 전에 안내를 봤다는 기록을 남긴다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 주문인지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return ackEarlySend({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
