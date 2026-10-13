"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import { useState } from "react";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { postDifferencePrepare, type DifferenceCheckout } from "@/features/difference-pay/api/post-difference-client";
import { formatDateTime } from "@/shared/lib/format/datetime";
import s from "./gift-status.module.css";

// 차액 결제 (payment INV-M11·M12·M13). 도착한 상자를 재어 보니 구간이 더 크면 상자마다 차액을 따로 낸다.
// 금액·기한은 서버가 정한 값만 보인다 — 「차액 결제하기」를 누르면 서버가 결제 번호와 금액을 준다(브라우저는 금액을 보내지 않는다).
// 같은 화면 자리에 결제창(첫 결제와 같은 PaymentStep)이 뜨고, 결제가 끝나면 서버가 승인한 뒤 이 화면으로 돌려보낸다.

export type DifferenceNotice = "paid" | "failed" | "in_progress" | "closed" | null;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function tierName(t: string): string {
  return t in PARCEL_TIER_GUIDE ? PARCEL_TIER_GUIDE[t as keyof typeof PARCEL_TIER_GUIDE].name : t;
}

const NOTICE_TEXT: Record<Exclude<DifferenceNotice, null>, string> = {
  paid: "차액 결제가 끝났어요. 이제 크리에이터에게 보낼 수 있어요.",
  failed: "차액 결제를 마치지 못했어요. 다시 결제해 주세요.",
  in_progress: "결제를 확인하고 있어요. 잠시 뒤 화면을 새로고침해 주세요.",
  closed: "기한이 지났거나 상자를 돌려보내기로 해서 차액을 받을 수 없어요. 결제된 돈은 없어요.",
};

const STATE_TAG = {
  due: { text: "결제 필요", className: statusTagClass("warn") },
  paying: { text: "결제 확인 중", className: statusTagClass("warn") },
  paid: { text: "결제 완료", className: statusTagClass("success") },
  closed: { text: "기한 지남", className: statusTagClass("danger") },
} as const;

type Props = { orderNo: string; differences: readonly GiftDifference[]; clientKey: string; notice: DifferenceNotice };

export function DifferenceSection({ orderNo, differences, clientKey, notice }: Props) {
  const [checkout, setCheckout] = useState<DifferenceCheckout | null>(null);
  const [busyBox, setBusyBox] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(boxId: string) {
    if (busyBox) return;
    setError(null);
    setBusyBox(boxId);
    const r = await postDifferencePrepare({ boxId });
    setBusyBox(null);
    if (r.ok) setCheckout(r.checkout);
    else setError(r.message);
  }

  if (checkout) {
    if (!clientKey) {
      return (
        <p className="part" role="alert">
          지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.
        </p>
      );
    }
    return (
      <PaymentStep
        clientKey={clientKey}
        pending={checkout}
        route={{
          orderName: `팬꾹 차액 ${checkout.orderNo}`,
          successPath: "/api/checkout/difference/success",
          failPath: `/gifts/${encodeURIComponent(orderNo)}?difference=failed`,
        }}
      />
    );
  }

  return (
    <div className="part">
      <h2 className="t-title">차액 결제</h2>
      <p className="t-lead t-desc">
        사무실에서 잰 상자가 고른 크기보다 커서 추가 결제가 필요해요. 결제를 마치면 바로 보내 드려요. 기한 안에 결제하지 않으면
        상자를 돌려보내고 배송비를 환불해 드려요.
      </p>
      {notice ? (
        <p className={s.more} role={notice === "failed" || notice === "closed" ? "alert" : "status"}>
          <strong>{NOTICE_TEXT[notice]}</strong>
        </p>
      ) : null}
      {error ? (
        <p className={s.more} role="alert">
          <strong>{error}</strong>
        </p>
      ) : null}
      <div className={s.inner}>
        {differences.map((d) => {
          const tag = STATE_TAG[d.state];
          return (
            <div key={d.boxId} className={`card card--soft ${s.diff}`}>
              <div className={s["box-head"]}>
                <h3>
                  상자 {d.boxSeq} · {won(d.amountKrw)}
                </h3>
                <span className={tag.className}>{tag.text}</span>
              </div>
              <p className="t-meta">
                보낼 때 고른 크기 {tierName(d.declaredTier)} → 재어 본 크기 {tierName(d.measuredTier)}
                {d.state === "due" ? ` · ${formatDateTime(d.dueAt)}까지` : null}
              </p>
              {d.state === "due" ? (
                <div>
                  <button className="btn" type="button" onClick={() => void start(d.boxId)} aria-disabled={busyBox !== null} aria-busy={busyBox === d.boxId || undefined}>
                    {busyBox === d.boxId ? "준비하는 중…" : `${won(d.amountKrw)} 차액 결제하기`}
                  </button>
                </div>
              ) : null}
              {d.state === "closed" ? <p className="hint">기한이 지나 이 상자는 돌려보내 드려요.</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
