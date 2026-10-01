import { shippingFeeFromEnv } from "@/entities/payment/config/shipping-fee";
import { computeCharge } from "@/entities/payment/model/charge";
import { LandingPage } from "@/widgets/landing/ui/landing-page";

// 요금표는 실제 결제와 같은 계산을 쓴다 — 화면 숫자와 결제 금액이 어긋나지 않게.
export default function Page() {
  const charge = computeCharge({ shippingFeeKrw: shippingFeeFromEnv(process.env) });
  return <LandingPage charge={charge} />;
}
