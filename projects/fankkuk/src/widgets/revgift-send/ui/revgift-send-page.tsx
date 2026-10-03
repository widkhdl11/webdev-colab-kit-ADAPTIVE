"use client";

import { useState } from "react";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { RevgiftSendForm, type RevgiftCheckout } from "@/features/revgift-send/ui/send-form";

// 역조공 보내기 본문(크리에이터). 시안: docs/design/mockups/site/v4/creator-revgift-new.html
// 「결제하기」를 누르면 서버에 등록되고(결제 대기), 같은 자리에 결제창이 뜬다. 결제가 끝나면 서버가 보낸 역조공 목록으로 보낸다.
// 헤더·푸터는 라우트(app)가 붙인다.
export function RevgiftSendPage({ clientKey, notice }: { clientKey: string; notice?: string }) {
  const [registered, setRegistered] = useState<RevgiftCheckout | null>(null);

  return (
    <main id="main">
      <div className="container page-title">
        <h1 className="page-h">역조공 보내기</h1>
        <p>
          {registered
            ? `팬 ${registered.fanCount}명에게 보내요 — 결제하면 보내기가 끝나요.`
            : "나를 팔로우한 팬에게 선물을 보내요. 팬 아이디를 정확히 입력해서 한 명씩 추가해 주세요."}
        </p>
      </div>
      {registered ? (
        clientKey ? (
          <PaymentStep
            clientKey={clientKey}
            pending={registered}
            route={{
              orderName: `팬꾹 역조공 ${registered.fanCount}명`,
              successPath: "/api/revgifts/checkout/success",
              failPath: "/creator/revgifts/new?payment=failed",
            }}
          />
        ) : (
          <p className="container" role="alert">
            지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.
          </p>
        )
      ) : (
        <div className="container">
          <RevgiftSendForm notice={notice} onRegistered={setRegistered} />
        </div>
      )}
    </main>
  );
}
