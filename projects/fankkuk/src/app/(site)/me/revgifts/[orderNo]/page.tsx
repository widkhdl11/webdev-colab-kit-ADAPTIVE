import { permanentRedirect } from "next/navigation";
import { giftDetailHref } from "@/entities/action-item/model/action-items";

// 옛 받은 선물 상세 주소 — 같은 주문번호의 선물 상세 `/gifts/{주문번호}` 로 영구히 넘긴다(action-center INV-J12).
// 이미 나간 알림 링크가 살아 있어야 한다. 누구 것인지·있는지는 넘어간 상세가 로그인 토큰으로 판정한다(여기서는 아무것도 읽지 않는다).
// 주문번호는 경로 한 칸으로만 붙인다 — 다른 경로로 바뀌지 않게 한 칸으로 인코딩한다.
export default async function Page({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  permanentRedirect(giftDetailHref(encodeURIComponent(orderNo)));
}
