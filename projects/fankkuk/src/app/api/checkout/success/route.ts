import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/features/checkout/model/checkout";
import { checkoutDeps } from "../deps";

// 토스 결제창이 성공하면 이 주소로 paymentKey·orderId·amount 를 붙여 보낸다.
// 쿼리 값은 대조용일 뿐이다 — 승인은 서버가 승인 API 를 부르고 응답을 판정해야 끝난다(INV-M2·M3).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const outcome = await confirmPayment(checkoutDeps(), {
    orderId: q.get("orderId") ?? "",
    amount: q.get("amount") ?? "",
    paymentKey: q.get("paymentKey") ?? "",
  });

  const back = new URL("/", req.nextUrl.origin);
  if (outcome.ok) {
    back.searchParams.set("result", "done");
    back.searchParams.set("orderId", outcome.orderId);
  } else {
    back.searchParams.set("result", "fail");
    back.searchParams.set("reason", outcome.reason);
  }
  return NextResponse.redirect(back, 303);
}
