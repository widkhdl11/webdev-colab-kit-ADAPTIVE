import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { cancelMyGift } from "@/features/gift-cancel/model/cancel-gift";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬의 입고 전 취소(payment INV-M16) — 상자가 하나도 입고되지 않은 결제 완료 주문을 보낸 사람이 취소한다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 주문인지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return cancelMyGift({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
