import { notFound } from "next/navigation";
import { SAMPLE_ORDERS, SAMPLE_SIGNED_IN_FAN } from "@/entities/order/api/sample-orders";
import { OFFICE_ADDRESS } from "@/entities/order/config/office-address";
import { toFanView } from "@/entities/order/model/fan-view";
import { GiftStatusPage } from "@/widgets/gift-status/ui/gift-status-page";

// 예시 데이터로 그린다. 내 주문이 아니면 없는 주소로 취급한다(남의 주문번호를 넣어 보는 것을 막는다).
export default async function Page({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const order = SAMPLE_ORDERS.find((o) => o.orderNo === orderNo && o.fanNickname === SAMPLE_SIGNED_IN_FAN);
  if (!order) notFound();
  return <GiftStatusPage view={toFanView(order, OFFICE_ADDRESS)} />;
}
