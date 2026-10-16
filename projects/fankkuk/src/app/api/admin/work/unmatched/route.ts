import type { NextRequest } from "next/server";
import { linkHeld, readLinkCandidates } from "@/features/admin-held-link/model/link-held";
import { returnHeld } from "@/features/admin-held-return/model/return-held";
import { moveShare, readMoveCandidates } from "@/features/admin-share-move/model/move-share";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 운영자 확인 목록의 쓰기 — 몸통의 kind 로 가른다.
// - return: 「반송으로 넘기기」 (inbound-address-code INV-C6·C9)
// - candidates · link: 주인이 문의한 6자리 없는 상자를 송장번호·내용물 확인 뒤 그 팬의 입고 전 상자에 잇기 (INV-C12, 카드 d94)
// - move_candidates · move: 크리에이터가 찾기로 잘못 고른 몫의 상자를 같은 크리에이터의 다른 도착 전 몫으로 옮기기 (INV-C11, 카드 d93 ⑧)
// 운영자가 아니면 404. 로그인한 사람의 세션 클라이언트로 DB 를 부른다. 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 되어 아무나 처리한다.
function kindOf(body: unknown): unknown {
  return typeof body === "object" && body !== null ? (body as { kind?: unknown }).kind : undefined;
}

export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const client = await createRequestSupabase();
    const kind = kindOf(body);
    if (kind === "link") return linkHeld(client, body);
    if (kind === "candidates") return readLinkCandidates(client, body);
    if (kind === "move") return moveShare(client, body);
    if (kind === "move_candidates") return readMoveCandidates(client, body);
    return returnHeld(client, body);
  });
}
