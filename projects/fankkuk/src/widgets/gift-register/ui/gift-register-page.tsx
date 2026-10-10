"use client";

import Link from "next/link";
import { useState } from "react";
import type { CalendarDate } from "@/entities/creator/model/receiving";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { receivingNotice } from "@/features/gift-register/model/receiving-notice";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import { RegisterForm, type CreatorOption, type RegisteredGift } from "@/features/gift-register/ui/register-form";
import s from "./gift-register-page.module.css";

// 선물 보내기 본문(팬·크리에이터). 시안: docs/design/mockups/site/v4/send.html (4단계, 카드 안 이전·다음, PC 오른쪽 요약)
// 4단계에서 「결제하기」를 누르면 서버에 등록되고(결제 대기), 같은 자리에 결제창이 뜬다.
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리 import 하지 않게.
export function GiftRegisterPage({
  creators,
  prices,
  initialCreatorId,
  clientKey,
  notice,
  signedIn = true,
  followFirst = null,
  today,
}: {
  creators: readonly CreatorOption[];
  /** 지금 공개 요금표 — 서버 page 가 DB 공개 읽기 함수로 읽어 넘긴다. */
  prices: PublicPriceTable;
  initialCreatorId?: string;
  /** 토스 결제창 공개 키. 없으면 결제창 대신 안내만 보인다. */
  clientKey: string;
  notice?: string;
  /** 로그인했는가 — 아니면 팔로우한 사람이 없으니 로그인 안내를 보여 준다. */
  signedIn?: boolean;
  /** 크리에이터 페이지에서 미리 고르고 왔는데 아직 팔로우하지 않은 사람 — 「팔로우하고 선물 보내기」를 따로 보여 준다(INV-L9). */
  followFirst?: { id: string; name: string } | null;
  /** 한국 시간 오늘 — 서버가 정해 넘긴다(creator-receiving 계산) */
  today: CalendarDate;
}) {
  const [registered, setRegistered] = useState<RegisteredGift | null>(null);
  // creator-receiving INV-B2·B6: 크리에이터 페이지에서 미리 고르고 왔는데 쉬는 중이거나 내가 이번 달 한도에 닿았으면 폼 대신 안내.
  // 「다른 크리에이터에게 보내기」를 누르면 미리 고른 것을 비우고 폼을 연다.
  const preselected = creators.find((c) => c.id === initialCreatorId);
  const preselectedNotice = receivingNotice(preselected, today);
  const [pickOther, setPickOther] = useState(false);
  const blockedNotice = pickOther ? null : preselectedNotice;

  return (
    <main id="main">
      <div className="container page-title">
        <h1 className="page-h">선물 보내기</h1>
        <p>{registered ? `주문번호 ${registered.orderNo} — 결제하면 등록이 끝나요.` : "누구에게, 무엇을, 몇 상자 보낼지 알려 주세요."}</p>
        {!registered ? <p className="sub">팔로우한 크리에이터에게만 선물을 보낼 수 있어요.</p> : null}
      </div>
      {followFirst && !registered ? (
        <div className="container">
          <div className={s["follow-first"]} role="status">
            <p>
              <strong>{followFirst.name}님</strong>을 팔로우하면 바로 선물을 보낼 수 있어요.
            </p>
            <FollowThenSend creatorId={followFirst.id} creatorName={followFirst.name} signedIn={signedIn} className="btn btn--sm" />
          </div>
        </div>
      ) : null}
      {creators.length === 0 && !registered ? (
        <div className="container">
          <div className={s["empty-box"]}>
            <span className={s["ico-tile"]} aria-hidden="true">
              <img className="asset" src="/img/icon-gift.png" alt="" aria-hidden="true" width={64} height={64} />
            </span>
            {signedIn ? (
              <>
                <h2>아직 팔로우한 크리에이터가 없어요</h2>
                <p className="sub">선물은 팔로우한 크리에이터에게만 보낼 수 있어요. 좋아하는 크리에이터를 찾아 팔로우해 보세요.</p>
                <Link className="btn" href="/creators">
                  크리에이터 찾기
                </Link>
              </>
            ) : (
              <>
                <h2>로그인하고 선물을 보내 주세요</h2>
                <p className="sub">선물은 팔로우한 크리에이터에게만 보낼 수 있어요. 로그인하면 팔로우한 크리에이터가 여기에 나와요.</p>
                <Link className="btn" href="/login">
                  로그인
                </Link>
              </>
            )}
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
      ) : blockedNotice && preselected ? (
        <div className="container">
          <div className={s["empty-box"]} role="status">
            <span className={s["ico-tile"]} aria-hidden="true">
              <img className="asset" src="/img/icon-gift.png" alt="" aria-hidden="true" width={64} height={64} />
            </span>
            <h2>{preselected.name}님</h2>
            <p>{blockedNotice}</p>
            {creators.length > 1 ? (
              <button className="btn" type="button" onClick={() => setPickOther(true)}>
                다른 크리에이터에게 보내기
              </button>
            ) : (
              <Link className="btn" href={`/creators/${preselected.id}`}>
                크리에이터 페이지로
              </Link>
            )}
          </div>
        </div>
      ) : (
        <RegisterForm
          creators={creators}
          prices={prices}
          initialCreatorId={pickOther ? "" : initialCreatorId}
          notice={notice}
          onRegistered={setRegistered}
          today={today}
        />
      )}
    </main>
  );
}
