import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { reportNotMine } from "@/features/box-waybill/model/save-waybill";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 제가 보낸 게 아니에요(inbound-address-code INV-C8) — 입고된 내 상자(팬 선물 상자 · 역조공 몫)를 보류로 돌린다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 주문 주인인지·출고 전인지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return reportNotMine({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
