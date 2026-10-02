import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/features/checkout/model/checkout";
import { checkoutDeps } from "../deps";

// 토스 결제창이 성공하면 이 주소로 paymentKey·orderId·amount 를 붙여 보낸다.
// 쿼리 값은 대조용일 뿐이다 — 승인은 서버가 승인 API 를 부르고 응답을 판정해야 끝난다(INV-M2·M3).
// 끝나면 선물 상세로, 실패하면 선물 보내기 화면으로 돌려보낸다.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const outcome = await confirmPayment(checkoutDeps(), {
    orderId: q.get("orderId") ?? "",
    amount: q.get("amount") ?? "",
    paymentKey: q.get("paymentKey") ?? "",
  });

  if (outcome.ok) return NextResponse.redirect(new URL(`/gifts/${encodeURIComponent(outcome.orderNo)}?paid=1`, req.nextUrl.origin), 303);
  const back = new URL("/gifts/new", req.nextUrl.origin);
  back.searchParams.set("payment", outcome.reason === "in_progress" ? "in_progress" : "failed");
  return NextResponse.redirect(back, 303);
}
