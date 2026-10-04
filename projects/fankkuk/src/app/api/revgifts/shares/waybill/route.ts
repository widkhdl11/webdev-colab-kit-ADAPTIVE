import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { saveShareWaybill } from "@/features/box-waybill/model/save-waybill";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 역조공 몫 하나의 원 송장번호 등록·고치기(보낸 크리에이터, design-rules 8-1). 입고 전까지만 — DB 가 판정한다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 상자인지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return saveShareWaybill({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
