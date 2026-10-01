import { SAMPLE_CREATORS } from "@/entities/creator/api/sample-creators";
import { SAMPLE_ORDERS } from "@/entities/order/api/sample-orders";
import { averageApprovalMinutes } from "@/entities/order/model/approval-time";
import { shippingFeeFromEnv } from "@/entities/payment/config/shipping-fee";
import { computeCharge } from "@/entities/payment/model/charge";
import { GiftRegisterPage } from "@/widgets/gift-register/ui/gift-register-page";

// 예시 데이터로 그린다. DB 가 붙으면 크리에이터 목록·승인 기록을 거기서 읽는다.
export default function Page() {
  const creators = SAMPLE_CREATORS.map((c) => ({
    ...c,
    averageApprovalMinutes: averageApprovalMinutes(SAMPLE_ORDERS.filter((o) => o.creatorId === c.id)),
  }));
  const charge = computeCharge({ shippingFeeKrw: shippingFeeFromEnv(process.env) });
  return <GiftRegisterPage creators={creators} charge={charge} />;
}
