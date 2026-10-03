import type { NextRequest } from "next/server";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { createSupabaseRevgiftPaymentStore } from "@/features/revgift-send/api/supabase-revgift-store";
import { confirmRevgiftPayment } from "@/features/revgift-send/model/confirm-revgift";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";
import { seeOther } from "@/shared/lib/http/see-other";

// 토스 결제창이 역조공 결제에 성공하면 이 주소로 돌아온다. 쿼리 값은 대조용일 뿐이다 —
// 승인은 서버가 승인 API 를 부르고 응답을 판정해야 끝난다. 보낸 크리에이터의 결제만 처리한다.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const requesterId = await readVerifiedUserId((await createRequestSupabase()).auth);
  const env = process.env;
  const outcome = await confirmRevgiftPayment(
    {
      store: createSupabaseRevgiftPaymentStore(createAdminSupabase()),
      toss: createTossPaymentsClient({ secretKey: readTossSecretKey(env), env, fetchImpl: fetch }),
    },
    requesterId,
    { orderId: q.get("orderId") ?? "", amount: q.get("amount") ?? "", paymentKey: q.get("paymentKey") ?? "" },
  );
  if (outcome.ok) return seeOther("/creator/revgifts?paid=1");
  return seeOther(`/creator/revgifts/new?payment=${outcome.reason === "in_progress" ? "in_progress" : "failed"}`);
}
