import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { findHeldParcel } from "@/features/box-waybill/model/save-waybill";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 받는 주소 없이 보냈어요(inbound-address-code INV-C4 ②·C10) — 내 상자(팬 선물 상자 · 역조공 몫) + 송장번호·택배사·보낸 사람 이름 앞 1글자로
// 보류 상자와 잇는다. 운영자는 못 쓴다. 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 상자인지는 DB 가 그 토큰으로 판정한다.
// 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return findHeldParcel({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
