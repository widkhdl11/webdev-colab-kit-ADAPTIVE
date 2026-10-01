import { createMemoryPaymentStore } from "@/entities/payment/api/memory-payment-store";
import type { CheckoutDeps } from "@/features/checkout/model/checkout";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";

// 시험 결제용 조립. DB 가 붙으면 메모리 저장소 자리만 바뀐다.
// 개발 서버는 코드를 바꿀 때마다 모듈을 다시 읽으므로, 저장소는 globalThis 에 한 벌만 둔다.
const holder = globalThis as unknown as { __fankkukCheckoutDeps?: CheckoutDeps };

const DEFAULT_SHIPPING_FEE_KRW = 4000; // 택배 계약 전 가정값 (payment 스펙 비범위 절)

export function checkoutDeps(): CheckoutDeps {
  if (holder.__fankkukCheckoutDeps) return holder.__fankkukCheckoutDeps;
  const env = process.env;
  const deps: CheckoutDeps = {
    store: createMemoryPaymentStore({ env }),
    toss: createTossPaymentsClient({ secretKey: readTossSecretKey(env), env, fetchImpl: fetch }),
    shippingFeeKrw: env.SHIPPING_FEE_KRW ? Number(env.SHIPPING_FEE_KRW) : DEFAULT_SHIPPING_FEE_KRW,
  };
  holder.__fankkukCheckoutDeps = deps;
  return deps;
}
