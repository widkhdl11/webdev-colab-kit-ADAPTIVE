"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { SurchargeRegion } from "@/entities/address/model/surcharge-region";
import type { FanBox } from "@/entities/revgift-box/api/box-reads";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import d from "@/shared/ui/dialog-parts.module.css";
import type { Envelope } from "@/shared/lib/envelope/envelope";
import type { SealedAddressSendOutcome } from "@/shared/ui/sealed-address-form";
import { DELIVERY_STAGE_LABEL } from "@/shared/config/delivery-status";
import type { DeliveryStatusSource } from "@/shared/config/delivery-status";
import { deliveryStage, isEstimatedStage } from "@/shared/lib/delivery/delivery-stage";
import { sendApply, sendReceived, sendWithdraw } from "../api/apply-requests";
import s from "./box-apply.module.css";

// 팬 신청 폼 (revgift-box INV-GB4·GB6·GB9 · 화면 명세 docs/ux/pages/gift-boxes-boxId.md).
// 신청 = 받기 — 신청할 때마다 받는 분 이름·휴대폰 번호·주소를 입력하고 「신청」을 누르면, 이 브라우저에서 봉인한 값과 할증 구분만 신청 요청에 실린다
// (팬 등록 주소는 없다 — 2026-11-08, address-protection INV-P17). 역조공 받기(receive-flow)와 같은 흐름이다. 팔로우·인원·마감 판정은 서버가 한다.
// 다른 신청자 수·닉네임·받을 인원은 보이지 않는다(정할 것 Q6). 제외됐는지도 보이지 않는다.

export type ApplyAddressStep = {
  canEnter: boolean;
  /** 주소 입력 칸 — send 는 봉인된 주소로 신청을 보낸다. 성공하면 onDone */
  renderForm: (p: { send: (envelope: Envelope, region: SurchargeRegion) => Promise<SealedAddressSendOutcome>; onDone: () => void }) => ReactNode;
  missingKeyText: string;
};

/**
 * 내 선물의 배송 단계(delivery-status INV-DS1·DS2·DS6) — 팬꾹에서 보냈어요 → 보통 1~2일 안에 도착해요 → 도착했어요(팬의 받았어요) / 확인 없이 출고 + 3일이면 도착했어요(예상, 흐리게).
 * 받는 쪽은 팬이다 — 출고 뒤 [받았어요]를 누르면 확정. 송장번호·택배사 조회 링크는 없다(INV-DS3).
 */
function BoxDeliveryCard({
  box,
  delivery,
  now,
  deliverySource,
  here,
}: {
  box: FanBox;
  delivery: NonNullable<FanBox["delivery"]>;
  now: string;
  deliverySource: DeliveryStatusSource;
  here: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = deliveryStage({ printed: true, shippedAt: delivery.shippedOn, confirmed: delivery.received, carrier: delivery.carrier }, now, deliverySource);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await sendReceived(box.id);
    setBusy(false);
    if (o.ok) {
      router.refresh();
      return;
    }
    if (o.status === 401) {
      router.push(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    setError(o.message);
  };
  return (
    <div className={s.card}>
      {stage ? (
        <p className={isEstimatedStage(stage) ? `${s.done} ${s.estimated}` : s.done} data-delivery-stage={stage}>
          {DELIVERY_STAGE_LABEL[stage]}
        </p>
      ) : null}
      <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
      {delivery.canConfirm ? (
        <div>
          <button className="btn" type="button" onClick={() => void confirm()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
            받았어요
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BoxApplyPanel({
  box,
  token,
  address,
  followSlot,
  now,
  deliverySource,
}: {
  box: FanBox;
  token: string | null;
  address: ApplyAddressStep;
  followSlot: ReactNode;
  /** 화면을 그린 서버 시각 — 배송 단계의 날짜 경계 */
  now: string;
  /** DB 의 단계 설정값(delivery-status INV-DS11) */
  deliverySource: DeliveryStatusSource;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const here = `/gift-boxes/${box.id}${token ? `?invite=${encodeURIComponent(token)}` : ""}`;

  if (box.viewer === "guest") {
    return (
      <div className={s.card}>
        <p>로그인한 뒤 신청할 수 있습니다.</p>
        <Link className="btn" href={`/login?next=${encodeURIComponent(here)}`}>
          로그인
        </Link>
      </div>
    );
  }
  if (box.viewer === "owner") {
    return (
      <div className={s.card}>
        <p>내가 만든 선물함입니다.</p>
        <Link className="btn btn--line" href={`/creator/revgift-boxes/${box.id}`}>
          신청 관리
        </Link>
      </div>
    );
  }
  if (box.viewer === "not_fan") return <p className={s.card}>팬 계정만 신청할 수 있습니다.</p>;

  if (box.myState === "preparing") {
    if (box.delivery) return <BoxDeliveryCard box={box} delivery={box.delivery} now={now} deliverySource={deliverySource} here={here} />;
    return <p className={s.card}>선물이 준비되고 있어요.</p>;
  }
  if (box.myState === "cancelled") return <p className={s.card}>선물함이 취소됐어요.</p>;
  if (box.myState === "closed" || (!box.open && box.myState === "none")) return <p className={s.card}>이번 선물함은 마감됐어요.</p>;

  if (box.viewer === "not_follower" && box.myState === "none") {
    return (
      <div className={s.card}>
        <p>팔로우한 팬만 신청할 수 있습니다.</p>
        {followSlot}
      </div>
    );
  }

  const fail = (o: { status: number; message: string }) => {
    if (o.status === 401) {
      router.push(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    setError(o.message);
    // 마감·다 참·이미 신청 — 지금 상태를 다시 읽어 그 안내로 바꾼다
    if (o.status === 409 || o.status === 403) router.refresh();
  };

  // 입력 칸이 봉인한 주소로 신청을 보낸다(INV-GB6). 결과는 칸에 돌려준다 — 거부 문구는 칸이 보인다
  const apply = async (envelope: Envelope, region: SurchargeRegion): Promise<SealedAddressSendOutcome> => {
    setError(null);
    const o = await sendApply(box.id, token, envelope, region);
    if (o.ok) return { kind: "ok" };
    if (o.status === 401) return { kind: "login" };
    // 마감·다 참·이미 신청 — 지금 상태를 다시 읽어 그 안내로 바꾼다
    if (o.status === 409 || o.status === 403) router.refresh();
    return { kind: "refused", message: o.message };
  };

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const o = await sendWithdraw(box.id);
    setBusy(false);
    setSheet(false);
    if (o.ok) {
      router.refresh();
      return;
    }
    fail(o);
  };

  if (box.myState === "applied") {
    return (
      <div className={s.card}>
        <p className={s.done}>신청했습니다.</p>
        <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
        <div>
          <button className="btn btn--line" type="button" onClick={() => setSheet(true)}>
            신청 취소
          </button>
        </div>
        <BottomSheet open={sheet} title="신청을 취소할까요?" busy={busy} onClose={() => setSheet(false)}>
          <div className={d.stack}>
            <p className={d.note}>이 신청에 입력한 받을 주소는 바로 삭제됩니다.</p>
            <div className={`${d.btns} ${d.two}`}>
              <button className="btn btn--line" type="button" onClick={() => setSheet(false)} disabled={busy}>
                닫기
              </button>
              <button className="btn" type="button" onClick={() => void withdraw()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
                신청 취소
              </button>
            </div>
          </div>
        </BottomSheet>
      </div>
    );
  }

  // 신청 폼 — 받을 주소(신청 때마다 입력)
  return (
    <section className={s.card} aria-labelledby="apply-addr-h">
      <h2 id="apply-addr-h" className={s.secH}>
        받을 주소 입력
      </h2>
      {!address.canEnter ? (
        <p className="err" role="status">
          {address.missingKeyText}
        </p>
      ) : (
        <>
          <p className="t-meta">{`주소는 입력한 기기에서 암호화해 전송합니다. ${box.creator.name}님에게는 공개하지 않습니다.`}</p>
          <div role="alert">{error ? <p className="err">{error}</p> : null}</div>
          {address.renderForm({ send: apply, onDone: () => router.refresh() })}
        </>
      )}
    </section>
  );
}
