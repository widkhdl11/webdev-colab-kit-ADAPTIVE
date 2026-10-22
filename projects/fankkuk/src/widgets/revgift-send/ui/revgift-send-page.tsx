"use client";

import { useState } from "react";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import type { RevgiftFollower } from "@/entities/revgift/api/revgift-reads";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { RevgiftSendForm, type RevgiftCheckout } from "@/features/revgift-send/ui/send-form";
import s from "./revgift-send.module.css";

// 팬에게 보내기 본문(크리에이터, 역조공). 시안: docs/design/mockups/site/v39-part3/revgifts-new-a.html (design-rules 25절 A안) —
// 가운데 틀(.page-centered) 안 넓은 기둥 1040. 제목은 사이드바와 같은 「팬에게 보내기」, 고르는 동안에는 설명 문장 없음.
// 「결제하기」를 누르면 서버에 등록되고(결제 대기), 같은 자리에 결제창이 뜬다. 결제가 끝나면 서버가 보낸 역조공 목록으로 보낸다.
// 헤더·푸터는 라우트(app)가 붙인다.
export function RevgiftSendPage({ clientKey, prices, followers, notice }: { clientKey: string; prices: PublicPriceTable; followers: readonly RevgiftFollower[]; notice?: string }) {
  const [registered, setRegistered] = useState<RevgiftCheckout | null>(null);

  return (
    <main id="main" className={`page-centered v34 ${s.page}`}>
      <div className={s.col}>
        <header className={`page-head ${s.head}`}>
          <h1 className="ph-title">팬에게 보내기</h1>
          {registered ? <p className="ph-desc">{`팬 ${registered.fanCount}명에게 보내요 — 결제하면 보내기가 끝나요.`}</p> : null}
        </header>
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
            <p className="err" role="alert">
              지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.
            </p>
          )
        ) : (
          <RevgiftSendForm prices={prices} followers={followers} notice={notice} onRegistered={setRegistered} />
        )}
      </div>
    </main>
  );
}
