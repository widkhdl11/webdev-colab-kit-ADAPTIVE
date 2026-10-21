import type { NextRequest } from "next/server";
import { readShippingIssues } from "@/features/admin-shipping-issues/model/shipping-issues";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 운영자 「배송문제 확인」(office-workflow INV-W10) — 몸통 { kind: "list" }. 읽기만 한다. 운영자가 아니면 404.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 운영자 판정은 DB 가 그 토큰으로 한다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => readShippingIssues(await createRequestSupabase(), body));
}
