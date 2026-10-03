"use client";

import Link from "next/link";
import { useState } from "react";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { RegisterForm, type CreatorOption, type RegisteredGift } from "@/features/gift-register/ui/register-form";
import s from "./gift-register-page.module.css";

// 선물 보내기 본문(팬·크리에이터). 시안: docs/design/mockups/site/v4/send.html (4단계, 카드 안 이전·다음, PC 오른쪽 요약)
// 4단계에서 「결제하기」를 누르면 서버에 등록되고(결제 대기), 같은 자리에 결제창이 뜬다.
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리 import 하지 않게.
export function GiftRegisterPage({
  creators,
  initialCreatorId,
  clientKey,
  notice,
  creatorSender = false,
}: {
  creators: readonly CreatorOption[];
  initialCreatorId?: string;
  /** 토스 결제창 공개 키. 없으면 결제창 대신 안내만 보인다. */
  clientKey: string;
  notice?: string;
  /** 크리에이터가 보내는 중 — 목록은 이미 팔로우가 한쪽이라도 있는 크리에이터로 걸러져 온다(INV-L9). */
  creatorSender?: boolean;
}) {
  const [registered, setRegistered] = useState<RegisteredGift | null>(null);

  return (
    <main id="main">
      <div className="container page-title">
        <h1 className="page-h">선물 보내기</h1>
        <p>{registered ? `주문번호 ${registered.orderNo} — 결제하면 등록이 끝나요.` : "누구에게, 무엇을, 몇 상자 보낼지 알려 주세요."}</p>
        {creatorSender && !registered ? (
          <p className="sub">서로 팔로우하거나 한쪽이라도 팔로우한 크리에이터에게만 보낼 수 있어요.</p>
        ) : null}
      </div>
      {creatorSender && creators.length === 0 ? (
        <div className="container">
          <div className={s["empty-box"]}>
            <span className={s["ico-tile"]} aria-hidden="true">
              <img className="asset" src="/img/icon-gift.png" alt="" aria-hidden="true" width={64} height={64} />
            </span>
            <h2>아직 선물을 보낼 수 있는 크리에이터가 없어요</h2>
            <p className="sub">크리에이터를 팔로우하면 여기에 나와요. 나를 팔로우한 크리에이터에게는 그 크리에이터 페이지에서 보낼 수 있어요.</p>
            <Link className="btn" href="/creators">
              크리에이터 찾기
            </Link>
          </div>
        </div>
      ) : registered ? (
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
