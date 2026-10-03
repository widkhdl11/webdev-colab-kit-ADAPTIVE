import { NextResponse, type NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { confirmPayment } from "@/features/checkout/model/checkout";
import { checkoutRequesterId } from "@/features/gift-register/model/sender-rule";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { checkoutDeps } from "../deps";

// 토스 결제창이 성공하면 이 주소로 paymentKey·orderId·amount 를 붙여 보낸다.
// 쿼리 값은 대조용일 뿐이다 — 승인은 서버가 승인 API 를 부르고 응답을 판정해야 끝난다(INV-M2·M3).
// 로그인한 사람(팬·크리에이터)이 등록한 결제만 처리한다(INV-L3) — 남의 결제 orderId 를 알아도 그 결제를 건드릴 수 없다.
// 끝나면 선물 상세로, 실패하면 선물 보내기 화면으로 돌려보낸다.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const viewer = await readViewer(await createRequestSupabase());
  const outcome = await confirmPayment(checkoutDeps(), checkoutRequesterId(viewer), {
    orderId: q.get("orderId") ?? "",
    amount: q.get("amount") ?? "",
    paymentKey: q.get("paymentKey") ?? "",
  });

  if (outcome.ok) return NextResponse.redirect(new URL(`/gifts/${encodeURIComponent(outcome.orderNo)}?paid=1`, req.nextUrl.origin), 303);
  const back = new URL("/gifts/new", req.nextUrl.origin);
  back.searchParams.set("payment", outcome.reason === "in_progress" ? "in_progress" : "failed");
  return NextResponse.redirect(back, 303);
}
