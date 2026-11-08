"use client";

import { useRouter } from "next/navigation";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import type { FanBox } from "@/entities/revgift-box/api/box-reads";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
import { FanAddressForm } from "@/features/fan-address/ui/fan-address-form";
import { BoxApplyPanel } from "@/features/revgift-box-apply/ui/box-apply-panel";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import s from "./revgift-box.module.css";

// 팬 신청 화면(revgift-box INV-GB4·GB6 · 화면 명세 docs/ux/pages/gift-boxes-boxId.md). 머리: 크리에이터 이름 · 선물함 이름.
// 신청 기능에 받을 주소 입력 칸(팬 받을 주소 기능)과 팔로우 버튼(팔로우 기능)을 조립해 넘긴다 — 기능끼리는 서로 import 하지 않는다(FSD).
export function BoxApplyPage({
  box,
  token,
  accountId,
  address,
  sealingKeyPem,
}: {
  box: FanBox;
  token: string | null;
  accountId: string | null;
  address: MyFanAddressStatus | null;
  sealingKeyPem: string | null;
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
          followSlot={<FollowButton creatorId={box.creator.id} creatorName={box.creator.name} initialFollowing={false} variant="profile" mode="save" />}
          address={{
            status: address,
            canEnter: sealingKeyPem !== null && accountId !== null,
            missingKeyText: ADDRESS_KEY_MISSING_TEXT,
            renderForm: (p) =>
              sealingKeyPem && accountId ? (
                <FanAddressForm
                  accountId={accountId}
                  sealingKeyPem={sealingKeyPem}
                  initialLabel={p.initialLabel}
                  autoFocusFirst={p.autoFocusFirst}
                  onSaved={p.onSaved}
                  onCancel={p.onCancel}
                  onLoginExpired={() => router.push(`/login?next=${encodeURIComponent(here)}`)}
                />
              ) : null,
          }}
        />
      </div>
    </main>
  );
}
