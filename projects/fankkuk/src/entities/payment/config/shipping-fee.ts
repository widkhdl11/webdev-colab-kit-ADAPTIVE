// 배송비 실비 설정. 택배 계약 전에는 가정값 4,000원(payment 스펙 비범위 절).
// 결제 금액과 메인 화면 요금표가 같은 값을 읽어야 화면 숫자와 실제 결제가 어긋나지 않는다.
export const DEFAULT_SHIPPING_FEE_KRW = 4000;

export function shippingFeeFromEnv(env: Record<string, string | undefined>): number {
  return env.SHIPPING_FEE_KRW ? Number(env.SHIPPING_FEE_KRW) : DEFAULT_SHIPPING_FEE_KRW;
}
