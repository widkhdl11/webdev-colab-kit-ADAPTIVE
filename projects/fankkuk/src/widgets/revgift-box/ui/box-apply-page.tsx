import type { FanBox } from "@/entities/revgift-box/api/box-reads";
import { FollowButton } from "@/features/creator-follow/ui/follow-button";
import { BoxApplyPanel } from "@/features/revgift-box-apply/ui/box-apply-panel";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import type { DeliveryStatusSource } from "@/shared/config/delivery-status";
import s from "./revgift-box.module.css";

// 팬 신청 화면(revgift-box INV-GB4·GB6 · 화면 명세 docs/ux/pages/gift-boxes-boxId.md). 머리: 크리에이터 이름 · 선물함 이름 + 신청 버튼 하나(모달).
// 신청 기능에 팔로우 버튼(팔로우 기능)을 조립해 넘긴다 — 기능끼리는 서로 import 하지 않는다(FSD).
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
  return (
    <main id="main" className="page-centered v34">
      <div className={`${s.narrow} ${s.stack}`}>
        <header className="page-head">
          <p className={s.kicker}>{box.creator.name}</p>
          <h1 className={`ph-title ${s.title}`}>{box.name}</h1>
          {box.description ? <p className={`ph-desc ${s.title}`}>{box.description}</p> : null}
        </header>
        {/* 팔로우 뒤 서버가 다시 그리면 보는 사람이 바뀐다 — 그때 판을 새로 시작한다. 신청 뒤(신청 상태 변화)에는 열린 신청 창을 이어서 보이려고 새로 시작하지 않는다 */}
        <BoxApplyPanel
          key={`${box.viewer}-${box.open}`}
          box={box}
          token={token}
          now={now}
          deliverySource={deliverySource}
          followSlot={<FollowButton creatorId={box.creator.id} creatorName={box.creator.name} initialFollowing={false} variant="profile" mode="save" />}
          addressKey={sealingKeyPem && accountId ? { accountId, sealingKeyPem } : null}
          missingKeyText={ADDRESS_KEY_MISSING_TEXT}
        />
      </div>
    </main>
  );
}
