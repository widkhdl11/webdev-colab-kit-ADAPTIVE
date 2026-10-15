"use client";

import { useState } from "react";
import { PaymentStep } from "@/features/checkout/ui/payment-step";
import { postDifferencePrepare, type DifferenceCheckout } from "@/features/difference-pay/api/post-difference-client";

// 상자 하나의 차액 결제 버튼 (payment INV-M11·M13, action-center INV-J4). 처리할 일 카드가 쓴다(선물 상세의 차액 구간은 widgets/gift-status/ui/difference-section.tsx).
// 새 처리 길을 만들지 않는다 — 선물 상세의 「차액 결제하기」와 같은 차액 결제 준비(/api/gifts/difference)를 부르고,
// 서버가 준 결제 번호·금액으로 같은 결제창(PaymentStep)을 띄운다. 금액은 서버가 정한 값만 쓴다. 결제가 끝나면 서버가 승인한 뒤 선물 상세로 돌려보낸다.

type Props = { boxId: string; orderNo: string; amountKrw: number; clientKey: string };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function DifferencePayButton({ boxId, orderNo, amountKrw, clientKey }: Props) {
  const [checkout, setCheckout] = useState<DifferenceCheckout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setError(null);
    setBusy(true);
    const r = await postDifferencePrepare({ boxId });
    setBusy(false);
    if (r.ok) setCheckout(r.checkout);
    else setError(r.message);
  }

  if (checkout) {
    if (!clientKey) {
      return <p role="alert">지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.</p>;
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
    <div>
      {error ? (
        <p role="alert">
          <strong>{error}</strong>
        </p>
      ) : null}
      <button className="btn" type="button" onClick={() => void start()} aria-disabled={busy} aria-busy={busy || undefined}>
        {busy ? "준비하는 중…" : `${won(amountKrw)} 결제하기`}
      </button>
    </div>
  );
}
