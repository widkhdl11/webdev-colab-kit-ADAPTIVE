import "server-only";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import type { CheckoutDeps } from "@/features/checkout/model/checkout";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";

// 결제 승인 조립: DB 결제 기록 + 토스 승인 API. 요청마다 만든다.
export function checkoutDeps(): CheckoutDeps {
  const env = process.env;
  return {
    store: createSupabasePaymentStore(createAdminSupabase()),
    toss: createTossPaymentsClient({ secretKey: readTossSecretKey(env), fetchImpl: fetch }),
  };
}
