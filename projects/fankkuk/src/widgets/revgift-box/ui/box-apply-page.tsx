"use client";

import { useRouter } from "next/navigation";
import type { FanBox } from "@/entities/revgift-box/api/box-reads";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
import { FanAddressFields } from "@/entities/address/ui/fan-address-fields";
import { BoxApplyPanel } from "@/features/revgift-box-apply/ui/box-apply-panel";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import type { DeliveryStatusSource } from "@/shared/config/delivery-status";
import s from "./revgift-box.module.css";

// 팬 신청 화면(revgift-box INV-GB4·GB6 · 화면 명세 docs/ux/pages/gift-boxes-boxId.md). 머리: 크리에이터 이름 · 선물함 이름.
// 신청 기능에 받을 주소 입력 칸(entities 의 팬 주소 칸)과 팔로우 버튼(팔로우 기능)을 조립해 넘긴다 — 기능끼리는 서로 import 하지 않는다(FSD).
export function BoxApplyPage({
  box,
  token,
  accountId,
  sealingKeyPem,
  now,
  deliverySource,
}: {
  box: FanBox;
  token: string | null;
  accountId: string | null;
  sealingKeyPem: string | null;
  /** 화면을 그린 서버 시각 — 배송 단계의 날짜 경계(delivery-status INV-DS1) */
  now: string;
  /** DB 의 단계 설정값(delivery-status INV-DS11) */
  deliverySource: DeliveryStatusSource;
}) {
  const router = useRouter();
  const here = `/gift-boxes/${box.id}${token ? `?invite=${encodeURIComponent(token)}` : ""}`;
  return (
    <main id="main" className="page-centered v34">
      <div className={s.narrow}>
        <header className="page-head">
          <p className={s.kicker}>{box.creator.name}</p>
          <h1 className={`ph-title ${s.title}`}>{box.name}</h1>
        </header>
        {/* 팔로우·신청 뒤 서버가 다시 그리면 보는 사람·신청 상태가 바뀐다 — 그때 판을 새로 시작해 새 주소 상태를 받는다 */}
        <BoxApplyPanel
          key={`${box.viewer}-${box.myState}-${box.open}`}
          box={box}
          token={token}
          now={now}
          deliverySource={deliverySource}
          followSlot={<FollowButton creatorId={box.creator.id} creatorName={box.creator.name} initialFollowing={false} variant="profile" mode="save" />}
          address={{
            canEnter: sealingKeyPem !== null && accountId !== null,
            missingKeyText: ADDRESS_KEY_MISSING_TEXT,
            renderForm: (p) =>
              sealingKeyPem && accountId ? (
                <FanAddressFields
                  idPrefix="ba"
                  accountId={accountId}
                  sealingKeyPem={sealingKeyPem}
                  send={p.send}
                  onSaved={p.onDone}
                  submitContent={(busy) => (busy ? "신청 중…" : "신청")}
                  onLoginExpired={() => router.push(`/login?next=${encodeURIComponent(here)}`)}
                />
              ) : null,
          }}
        />
      </div>
    </main>
  );
}
