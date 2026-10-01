import { SAMPLE_ORDERS, SAMPLE_SIGNED_IN_FAN } from "@/entities/order/api/sample-orders";
import { OFFICE_ADDRESS } from "@/entities/order/config/office-address";
import { toFanView } from "@/entities/order/model/fan-view";
import { GiftListPage } from "@/widgets/gift-list/ui/gift-list-page";

// 예시 데이터로 그린다. 팬 화면은 주문 기록을 그대로 받지 않고 팬용 모양(toFanView)만 받는다.
export default function Page() {
  const gifts = SAMPLE_ORDERS.filter((o) => o.fanNickname === SAMPLE_SIGNED_IN_FAN)
    .toSorted((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt))
    .map((o) => toFanView(o, OFFICE_ADDRESS));
  return <GiftListPage gifts={gifts} />;
}
