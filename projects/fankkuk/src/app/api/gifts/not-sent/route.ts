import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { markGiftNotSent } from "@/features/gift-not-sent/model/mark-not-sent";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 「아직 보내지 않음」(office-workflow INV-W10) — 누른 시각만 남기고 기한은 바꾸지 않는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 주문인지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return markGiftNotSent({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
