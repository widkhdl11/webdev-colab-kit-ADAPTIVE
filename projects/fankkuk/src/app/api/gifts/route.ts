import { NextResponse, type NextRequest } from "next/server";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { readViewer } from "@/entities/session/model/viewer";
import { createCreatorRelationReader } from "@/features/gift-register/api/creator-relation";
import { registerGift } from "@/features/gift-register/model/register-gift";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 선물 등록: 주문 + 상자 + 결제 대기. 보내는 사람(팬·크리에이터)은 세션에서 확인한 사람이다(INV-L3) — 본문의 사용자 칸은 읽지 않는다.
// 응답에는 결제창에 필요한 결제 orderId·주문번호·금액만 싣는다(칸 나눔은 싣지 않는다, INV-M7).
export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "잘못된 요청이에요." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const viewer = await readViewer(await createRequestSupabase());
  const admin = createAdminSupabase();
  const result = await registerGift(
    {
      store: createSupabasePaymentStore(admin),
      viewer,
      creatorRelation: createCreatorRelationReader(admin),
      readPrices: () => readTierPrices(admin),
    },
    body,
  );
  const headers = { "Cache-Control": "no-store" };
  if (result.ok) return NextResponse.json({ orderId: result.orderId, orderNo: result.orderNo, amountKrw: result.amountKrw }, { headers });
  if (result.status === 400) return NextResponse.json({ errors: result.errors }, { status: 400, headers });
  return NextResponse.json({ message: result.message }, { status: result.status, headers });
}
