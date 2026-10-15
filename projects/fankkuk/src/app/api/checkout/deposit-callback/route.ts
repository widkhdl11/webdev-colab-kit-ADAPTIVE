import type { NextRequest } from "next/server";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { settleGiftDone } from "@/features/checkout/model/checkout";
import { createSupabaseDepositStore } from "@/features/deposit-confirm/api/supabase-deposit-store";
import { handleDepositCallback } from "@/features/deposit-confirm/model/handle-deposit-callback";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";

// 토스 가상계좌 입금 알림 입구 (payment INV-M22·M24). 토스 개발자센터의 웹훅에 이 주소를 DEPOSIT_CALLBACK 으로 등록한다.
// 로그인·같은 사이트 확인이 없다(결제사 서버가 부른다) — 대신 본문 secret 을 결제 승인 때 저장한 값과 맞대어 보고,
// 맞아도 본문의 상태는 믿지 않고 결제사에 직접 조회한다(features/deposit-confirm).
// 200 은 처리가 끝났을 때만 — 그 밖에는 토스가 다시 보낸다. 응답 본문에는 결과 글자만 있다.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const admin = createAdminSupabase();
  const gifts = createSupabasePaymentStore(admin);
  try {
    const reply = await handleDepositCallback(
      {
        store: createSupabaseDepositStore(admin),
        // 결제사 클라이언트는 비밀 값이 맞은 뒤 조회할 때 처음 만든다
        lookup: (orderId) => createTossPaymentsClient({ secretKey: readTossSecretKey(process.env), env: process.env, fetchImpl: fetch }).getByOrderId(orderId),
        settleDone: async (orderId, paymentKey) => {
          const record = await gifts.find(orderId);
          return record ? settleGiftDone(gifts, record, paymentKey) : false;
        },
        now: () => new Date(),
      },
      body,
    );
    return Response.json(reply.body, { status: reply.status, headers: NO_STORE });
  } catch (e) {
    console.error("checkout/deposit-callback: 처리 중 예외", e instanceof Error ? e.message : typeof e);
    return Response.json({ message: "error" }, { status: 500, headers: NO_STORE });
  }
}
