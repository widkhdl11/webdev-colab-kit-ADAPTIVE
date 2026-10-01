import { NextResponse } from "next/server";
import { startCheckout } from "@/features/checkout/model/checkout";
import { checkoutDeps } from "./deps";

// 시험 결제용 결제 대기 생성. 요청 본문은 읽지 않는다 — 금액은 서버가 정한다(INV-M1). 시험은 소형 1상자.
// 실제 등록 흐름이 생기면 등록된 주문번호를 받는다. 지금은 시험용 주문번호를 만든다.
function testOrderNo(): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `FC-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

export async function POST() {
  const pending = await startCheckout(checkoutDeps(), { orderNo: testOrderNo(), boxes: ["small"] });
  return NextResponse.json({
    orderId: pending.orderId,
    orderNo: pending.orderNo,
    // 결제 기록의 칸 나눔(택배 원가·서비스료)은 브라우저에 보내지 않는다 — 팬에게는 한 금액만(INV-M7)
    amountKrw: pending.amountKrw,
  });
}
