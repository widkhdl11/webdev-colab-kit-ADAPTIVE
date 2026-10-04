import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { matchMyBox } from "@/features/box-waybill/model/save-waybill";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 내 물건 찾기(office-workflow INV-W5) — 내 상자 + 원 송장번호로 미확인 입고와 잇는다. 운영자는 못 쓴다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 상자인지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return matchMyBox({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
