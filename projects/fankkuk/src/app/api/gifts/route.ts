import { NextResponse, type NextRequest } from "next/server";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { readViewer } from "@/entities/session/model/viewer";
import { createCreatorRelationReader } from "@/features/gift-register/api/creator-relation";
import { createReturnAddressSaver } from "@/features/gift-register/api/save-return-address";
import { registerGift } from "@/features/gift-register/model/register-gift";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 선물 등록: 주문 + 상자 + 결제 대기. 보내는 사람(팬·크리에이터)은 세션에서 확인한 사람이다(INV-L3) — 본문의 사용자 칸은 읽지 않는다.
// 팬이 보내면 결제 화면에서 봉인한 반송 주소를 그 주문 사본으로 넣는다(payment INV-M25) — 넣지 못하면 결제창을 열지 않는다(503).
// 응답에는 결제창에 필요한 결제 orderId·주문번호·금액만 싣는다(칸 나눔은 싣지 않는다, INV-M7).
export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "유효하지 않은 요청입니다. 새로고침한 뒤 다시 시도해 주세요." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const requestClient = await createRequestSupabase();
  const viewer = await readViewer(requestClient);
  const admin = createAdminSupabase();
  const result = await registerGift(
    {
      store: createSupabasePaymentStore(admin),
      viewer,
      creatorRelation: createCreatorRelationReader(admin),
      readPrices: () => readTierPrices(admin),
      // payment INV-M25 ②: 반송 주소 사본은 그 팬의 로그인 토큰으로 넣는다
      saveReturnAddress: createReturnAddressSaver(requestClient),
    },
    body,
  );
  const headers = { "Cache-Control": "no-store" };
  if (result.ok) return NextResponse.json({ orderId: result.orderId, orderNo: result.orderNo, amountKrw: result.amountKrw, surchargeKrw: result.surchargeKrw }, { headers });
  if (result.status === 400) return NextResponse.json({ errors: result.errors }, { status: 400, headers });
  return NextResponse.json({ message: result.message, ...(result.reason ? { reason: result.reason } : {}) }, { status: result.status, headers });
}
