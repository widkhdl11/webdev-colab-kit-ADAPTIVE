import { NextResponse, type NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { declineGift } from "@/features/approval-request/model/decline-gift";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 받지 않기(거절)와 차단. 같은 사이트의 JSON 요청만 받는다 — 다른 사이트가 크리에이터 몰래 선물을 거절하지 못하게.
// 거절하는 사람은 세션에서 확인한 사람이다(INV-L2). DB 도 로그인 토큰으로 그 주문의 크리에이터인지 다시 확인한다(INV-D1).
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "잘못된 요청이에요." }, { status: 403, headers });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const supabase = await createRequestSupabase();
  const result = await declineGift({ client: supabase, viewer: await readViewer(supabase) }, body);
  if (result.ok) return NextResponse.json({ waitingOrderNos: result.waitingOrderNos }, { headers });
  return NextResponse.json({ message: result.message }, { status: result.status, headers });
}
