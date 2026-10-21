import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { storageRequest } from "@/features/storage-claim/model/storage";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 물품 보관소(inbound-address-code INV-C13) — 몸통의 kind 로 목록(list) · 선물 선택 후보(candidates) · 「내 물품 확인」(claim).
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구인지·후보인지·두 값이 맞는지는 DB 가 그 토큰으로 판정한다. 관리자 키를 쓰지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    return storageRequest({ client: supabase, viewer: await readViewer(supabase) }, body);
  });
}
