import type { NextRequest } from "next/server";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { createSupabaseDifferenceStore } from "@/features/difference-pay/api/supabase-difference-store";
import { confirmDifferencePayment } from "@/features/difference-pay/model/confirm-difference";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";
import { seeOther } from "@/shared/lib/http/see-other";

// 토스 결제창이 차액 결제에 성공하면 이 주소로 돌아온다. 쿼리 값은 대조용일 뿐이다 —
// 승인은 서버가 승인 API 를 부르고 응답을 판정해야 끝난다(payment INV-M2·M3·M5). 그 주문을 보낸 사람의 차액만 처리한다.
// 끝나면(실패해도) 선물 상세로 돌려보낸다. 남의 결제 번호면 선물 내역으로.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const requesterId = await readVerifiedUserId((await createRequestSupabase()).auth);
  const vars = process.env;
  const store = createSupabaseDifferenceStore(createAdminSupabase());
  const orderId = q.get("orderId") ?? "";
  const outcome = await confirmDifferencePayment(
    { store, toss: createTossPaymentsClient({ secretKey: readTossSecretKey(vars), env: vars, fetchImpl: fetch }) },
    requesterId,
    { orderId, amount: q.get("amount") ?? "", paymentKey: q.get("paymentKey") ?? "" },
  );
  if (outcome.ok) return seeOther(`/gifts/${encodeURIComponent(outcome.orderNo)}?difference=paid`);
  const found = orderId ? await store.find(orderId) : null;
  if (!found || requesterId === null || found.senderId !== requesterId) return seeOther("/gifts");
  // 기한이 지났거나 상자가 돌려보내는 쪽으로 가 승인 권리를 못 얻었으면(closed) 「확인 중」이 아니라 「기한 지남」으로 안내한다
  const notice = outcome.reason === "in_progress" || outcome.reason === "closed" ? outcome.reason : "failed";
  return seeOther(`/gifts/${encodeURIComponent(found.orderNo)}?difference=${notice}`);
}
