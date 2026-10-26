"use client";

import Link from "next/link";
import { useState } from "react";
import { channelOwnerLine } from "@/entities/creator/model/channel-badge";
import { channelPlatformOfLabel } from "@/entities/creator/model/channel-url";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { CheckIcon } from "@/entities/creator/ui/check-icon";
import type { CalendarDate } from "@/entities/creator/model/receiving";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { receivingNotice } from "@/features/gift-register/model/receiving-notice";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { sendGiftPhoto } from "@/features/gift-photo/api/send-gift-photo";
import { FOLLOW_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";
import {
  RegisterForm,
  type CreatorOption,
  type RegisterDraft,
  type RegisteredGift,
} from "@/features/gift-register/ui/register-form";
import { GiftSumBar, GiftSummaryCard } from "./gift-summary";
import s from "./gift-register-page.module.css";

// 선물 보내기 본문(팬·크리에이터). 시안: docs/design/mockups/site/v39-part3/gifts-new-b.html (design-rules 25절 B안 — 맨 위 하늘 단계 판 + 흰 입력 판 한 기둥 720). 로그인 전·팔로우 없음·쉬는 중은 흰 상태 카드
// 4단계에서 「결제하기」를 누르면 서버에 등록되고(결제 대기), 같은 자리에 결제창이 뜬다.
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리 import 하지 않게.
// 선물 사진(선택)을 골랐으면 등록 직후 그 주문에 올린 뒤 결제창을 연다(together INV-F2 — 서버가 열어 보고 사진 정보를 지워 저장한다).
// 사진을 올리지 못해도 결제는 그대로 진행하고 「함께한 시간」에서 다시 올릴 수 있다고 알린다.
// 입력 폼이 보이는 동안 PC 는 오른쪽 「보낼 선물」 칸(1~4단계), 휴대폰은 3단계 아래 합계 줄(design-rules 33절, UX 명세 docs/ux/pages/gifts-new.md). 결제창·상태 카드에는 없다.
// 맨 위 한 줄(추가분 4-4): 크리에이터 페이지에서 미리 고르고 왔으면 「{닉네임}님의 {플랫폼} 채널 소유자 확인 완료」. 플랫폼 값이 없으면 줄을 그리지 않는다.
export function GiftRegisterPage({
  creators,
  prices,
  initialCreatorId,
  clientKey,
  notice,
  resumeHref = null,
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
  /** 결제 실패로 돌아왔을 때 이어서 결제할 내 주문의 선물 상세 칸 주소 — 라우트가 지금 할 일 읽기로 확인해 넘긴다(d113 D-3). 없으면 null */
  resumeHref?: string | null;
  /** 로그인했는가 — 아니면 팔로우한 사람이 없으니 로그인 안내를 보여 준다. */
  signedIn?: boolean;
  /** 크리에이터 페이지에서 미리 고르고 왔는데 아직 팔로우하지 않은 사람 — 「팔로우하고 선물 보내기」를 따로 보여 준다(INV-L9). */
  followFirst?: { id: string; name: string; platform: string } | null;
  /** 한국 시간 오늘 — 서버가 정해 넘긴다(creator-receiving 계산) */
  today: CalendarDate;
}) {
  const [registered, setRegistered] = useState<RegisteredGift | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const onRegistered = async (gift: RegisteredGift, photo: File | null) => {
    if (photo) {
      const r = await sendGiftPhoto(gift.orderNo, photo);
      setPhotoNote(
        r.kind === "ok"
          ? null
          : "선물 사진을 업로드하지 못했습니다. 결제 후 ‘함께한 시간’에서 다시 업로드해 주세요.",
      );
    }
    setRegistered(gift);
  };
  // creator-receiving INV-B2·B6: 크리에이터 페이지에서 미리 고르고 왔는데 쉬는 중이거나 내가 이번 달 한도에 닿았으면 폼 대신 안내.
  // 「다른 크리에이터에게 보내기」를 누르면 미리 고른 것을 비우고 폼을 연다.
  const preselected = creators.find((c) => c.id === initialCreatorId);
  const preselectedNotice = receivingNotice(preselected, today);
  const [pickOther, setPickOther] = useState(false);
  const blockedNotice = pickOther ? null : preselectedNotice;
  // 폼에서 지금 고른 크리에이터 — 미리 고른 사람과 다르면 맨 위 한 줄을 숨긴다(다른 크리에이터의 채널 정보는 이 화면에서 읽어 오지 않는다)
  const [pickedId, setPickedId] = useState(initialCreatorId ?? "");
  // 폼이 알린 지금 입력 — 「보낼 선물」 칸과 아래 합계 줄이 그린다
  const [draft, setDraft] = useState<RegisterDraft | null>(null);
  const showForm = creators.length > 0 && !registered && !(blockedNotice && preselected);
  const ownerSource = preselected ?? followFirst;
  const ownerLine =
    pickOther || pickedId !== (initialCreatorId ?? "") || !ownerSource
      ? null
      : channelOwnerLine({ name: ownerSource.name, platform: channelPlatformOfLabel(ownerSource.platform) });

  return (
    <main id="main" className={`page-centered ${s.page}`}>
      <div className={`${s.col} ${showForm ? s.wide : ""}`}>
        <header className={`page-head ${s.head}`}>
          <h1 className="ph-title">선물 보내기</h1>
          {registered ? (
            <p className="ph-desc">{`주문번호 ${registered.orderNo} · 결제 후 선물 등록 완료`}</p>
          ) : creators.length === 0 ? (
            // 팔로우 0명·로그인 전에서만(d113 D-4) — 고를 사람이 있으면 1단계 설명이 같은 말을 한다
            <p className={s["top-meta"]}>팔로우한 크리에이터에게만 선물을 보낼 수 있습니다.</p>
          ) : null}
          {ownerLine ? (
            <p className={s.owner}>
              <span className={s["owner-mark"]} aria-hidden="true">
                <CheckIcon size={14} />
              </span>
              <span className={s["owner-text"]}>{ownerLine}</span>
            </p>
          ) : null}
        </header>
        {followFirst && !registered ? (
          <div className={s["follow-first"]} role="status">
            <p className={s["follow-text"]}>
              <strong>{followFirst.name}님</strong>에게 선물을 보내려면 먼저 팔로우해 주세요.
              <span>{FOLLOW_NICKNAME_NOTICE}</span>
            </p>
            <FollowThenSend
              creatorId={followFirst.id}
              creatorName={followFirst.name}
              signedIn={signedIn}
              className="btn btn--sm"
            />
          </div>
        ) : null}
        {creators.length === 0 && !registered ? (
          <div>
            <div className={s.status}>
              <img
                className={s.art}
                src="/images/home/icon-gift.webp"
                alt=""
                aria-hidden="true"
                width={96}
                height={96}
              />
              {signedIn ? (
                <>
                  <h2>팔로우한 크리에이터가 없습니다</h2>
                  <p>선물을 보낼 크리에이터를 찾아 팔로우해 주세요.</p>
                  <Link className="btn" href="/creators">
                    크리에이터 찾기
                  </Link>
                </>
              ) : (
                <>
                  <h2>로그인 후 이용해 주세요</h2>
                  <p>로그인하면 팔로우한 크리에이터에게 선물을 보낼 수 있습니다.</p>
                  <Link className="btn" href="/login">
                    로그인
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : registered ? (
          clientKey ? (
            <>
              {photoNote ? (
                <p className={s["photo-note"]} role="status">
                  {photoNote}
                </p>
              ) : null}
              <PaymentStep clientKey={clientKey} pending={registered} />
            </>
          ) : (
            <p role="alert">
              현재 결제를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )
        ) : blockedNotice && preselected ? (
          <div>
            <div className={s.status} role="status">
              <img
                className={s.art}
                src="/images/home/icon-gift.webp"
                alt=""
                aria-hidden="true"
                width={96}
                height={96}
              />
              <h2>{preselected.name}님</h2>
              <p>{blockedNotice}</p>
              {creators.length > 1 ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setPickOther(true)}
                >
                  다른 크리에이터에게 보내기
                </button>
              ) : (
                <Link
                  className="btn"
                  href={creatorPagePath({
                    id: preselected.id,
                    handle: preselected.handle ?? null,
                  })}
                >
                  크리에이터 페이지로
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className={s.grid}>
            <div className={s.main}>
              <RegisterForm
                creators={creators}
                prices={prices}
                initialCreatorId={pickOther ? "" : initialCreatorId}
                notice={notice}
                resumeHref={resumeHref}
                onRegistered={onRegistered}
                onCreatorChange={setPickedId}
                onDraftChange={setDraft}
                today={today}
              />
              {draft?.step === 3 ? <GiftSumBar draft={draft} /> : null}
            </div>
            <GiftSummaryCard draft={draft} />
          </div>
        )}
      </div>
    </main>
  );
}
