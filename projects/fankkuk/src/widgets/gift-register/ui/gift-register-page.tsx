"use client";

import { useState } from "react";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { RegisterForm, type CreatorOption, type RegisteredGift } from "@/features/gift-register/ui/register-form";

// 팬 — 선물 보내기 본문. 시안: docs/design/mockups/site/v4/send.html (4단계, 카드 안 이전·다음, PC 오른쪽 요약)
// 4단계에서 「결제하기」를 누르면 서버에 등록되고(결제 대기), 같은 자리에 결제창이 뜬다.
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리 import 하지 않게.
export function GiftRegisterPage({
  creators,
  initialCreatorId,
  clientKey,
  notice,
}: {
  creators: readonly CreatorOption[];
  initialCreatorId?: string;
  /** 토스 결제창 공개 키. 없으면 결제창 대신 안내만 보인다. */
  clientKey: string;
  notice?: string;
}) {
  const [registered, setRegistered] = useState<RegisteredGift | null>(null);

  return (
    <main id="main">
      <div className="container page-title">
        <h1 className="page-h">선물 보내기</h1>
        <p>{registered ? `주문번호 ${registered.orderNo} — 결제하면 등록이 끝나요.` : "누구에게, 무엇을, 몇 상자 보낼지 알려 주세요."}</p>
      </div>
      {registered ? (
        clientKey ? (
          <PaymentStep clientKey={clientKey} pending={registered} />
        ) : (
          <p className="container" role="alert">
            지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.
          </p>
        )
      ) : (
        <RegisterForm creators={creators} initialCreatorId={initialCreatorId} notice={notice} onRegistered={setRegistered} />
      )}
    </main>
  );
}
