import type { NextRequest } from "next/server";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { readViewer } from "@/entities/session/model/viewer";
import { createSupabaseRevgiftStore } from "@/features/revgift-send/api/supabase-revgift-store";
import { registerRevgift } from "@/features/revgift-send/model/register-revgift";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 역조공 보내기 등록: 보내기 + 몫 + 결제 대기. 보내는 크리에이터는 세션에서 확인한 사람이다 — 본문의 사람·금액 칸은 읽지 않는다(INV-R3).
// 받는 팬이 나를 팔로우하는지는 DB 등록 함수가 판정한다(INV-R1). 응답에는 결제창에 필요한 값만 싣는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const admin = createAdminSupabase();
    const result = await registerRevgift({ store: createSupabaseRevgiftStore(admin), viewer, readPrices: () => readTierPrices(admin) }, body);
    if (!result.ok) return { status: result.status, body: { message: result.message } };
    return { status: 200, body: { tossOrderId: result.tossOrderId, amountKrw: result.amountKrw, orderNos: result.orderNos } };
  });
}
