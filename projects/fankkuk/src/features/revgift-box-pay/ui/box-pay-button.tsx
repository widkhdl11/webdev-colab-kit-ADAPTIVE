"use client";

import { useState } from "react";
import { z } from "zod";
import { postBox } from "@/features/revgift-box-manage/api/box-requests";
import { PaymentStep } from "@/features/checkout/ui/payment-step";

// 명세서 「결제하기」(revgift-box INV-GB18) — 누르면 서버가 결제 대기를 만들고(금액은 저장된 명세서 금액), 같은 자리에 결제창이 뜬다.
// 결제가 끝나면 서버가 승인한 뒤 이 선물함 화면으로 돌려보낸다.

const startReply = z.object({ tossOrderId: z.string(), amountKrw: z.number().int().positive() });

export function BoxPayButton({ boxId, boxName, clientKey }: { boxId: string; boxName: string; clientKey: string }) {
  const [pending, setPending] = useState<{ orderId: string; amountKrw: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await postBox(`/api/revgift-boxes/${encodeURIComponent(boxId)}/pay`, {}, (d) => startReply.parse(d));
    setBusy(false);
    if (r.kind === "ok") setPending({ orderId: r.data.tossOrderId, amountKrw: r.data.amountKrw });
    else if (r.kind === "login") window.location.assign(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${boxId}`)}`);
    else setError(r.kind === "refused" ? r.message : "결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  if (pending) {
    if (!clientKey) {
      return (
        <p className="err" role="alert">
          현재 결제를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.
        </p>
      );
    }
    return (
      <PaymentStep
        clientKey={clientKey}
        pending={{ orderId: pending.orderId, orderNo: boxId, amountKrw: pending.amountKrw }}
        route={{
          orderName: `팬꾹 선물함 ${boxName}`.slice(0, 100),
          successPath: "/api/revgift-boxes/checkout/success",
          failPath: `/creator/revgift-boxes/${encodeURIComponent(boxId)}?payment=failed`,
        }}
      />
    );
  }
  return (
    <div>
      <button type="button" className="btn" onClick={start} disabled={busy}>
        결제하기
      </button>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
