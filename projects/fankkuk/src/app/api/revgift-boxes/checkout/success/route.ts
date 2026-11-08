import type { NextRequest } from "next/server";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { createSupabaseBoxPaymentStore } from "@/features/revgift-box-pay/api/supabase-box-payment-store";
import { confirmBoxPayment } from "@/features/revgift-box-pay/model/box-payment";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";
import { seeOther } from "@/shared/lib/http/see-other";

// 토스 결제창이 선물함 명세서 결제에 성공하면 이 주소로 돌아온다(revgift-box INV-GB18). 쿼리 값은 대조용일 뿐이다 —
// 승인은 서버가 승인 API 를 부르고 응답을 판정해야 끝난다. 선물함 주인의 결제만 처리한다.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const requesterId = await readVerifiedUserId((await createRequestSupabase()).auth);
  const outcome = await confirmBoxPayment(
    {
      store: createSupabaseBoxPaymentStore(createAdminSupabase()),
      toss: createTossPaymentsClient({ secretKey: readTossSecretKey(process.env), fetchImpl: fetch }),
    },
    requesterId,
    { orderId: q.get("orderId") ?? "", amount: q.get("amount") ?? "", paymentKey: q.get("paymentKey") ?? "" },
  );
  if (outcome.ok) return seeOther(`/creator/revgift-boxes/${encodeURIComponent(outcome.boxId)}?paid=1`);
  if (!outcome.boxId) return seeOther("/creator/revgift-boxes");
  return seeOther(`/creator/revgift-boxes/${encodeURIComponent(outcome.boxId)}?payment=${outcome.reason === "in_progress" ? "in_progress" : "failed"}`);
}
