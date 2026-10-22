"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postResumePayment, type ResumeCheckout } from "@/features/checkout/api/post-resume-client";
import { PaymentStep } from "@/features/checkout/ui/payment-step";

// 결제 미완료 주문의 「결제하기」 (payment INV-M22, action-center INV-J13). 선물 상세 맨 위 「지금 할 일」 칸이 쓴다.
// 누르면 결제 이어 하기 준비(/api/checkout/resume)를 부르고, 서버가 준 새 결제 번호·처음 저장한 금액으로 선물 등록 때와 같은 결제창(PaymentStep)을 띄운다.
// 칸이 펼쳐진 채 열리기만 해서는 아무것도 시작하지 않는다 — 이 버튼을 눌러야 이어 하기가 시작된다(INV-J13).
// 결제가 끝나면 기존 성공 주소(/api/checkout/success)가 승인한 뒤 선물 상세로 돌려보낸다.
// 결제창에서 실패하면 그 선물 상세에 ?payment=failed 를 붙여 돌아온다 — 칸 위에 「결제를 마치지 못했어요. 다시 결제해 주세요.」(2026-10-22 d113 진단 C-2).
// 쿼리는 화면 안내만 고른다 — 결제 대조·승인(INV-M2·M3)과 상관없다.

type Props = { orderNo: string; clientKey: string };

export function ResumePayButton({ orderNo, clientKey }: Props) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<ResumeCheckout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setError(null);
    setBusy(true);
    const r = await postResumePayment({ orderNo });
    setBusy(false);
    if (r.ok) {
      setCheckout(r.checkout);
      return;
    }
    setError(r.message);
    // 거부면 그 사이 상태가 바뀌었을 수 있다(24시간 지남·이미 결제 중) — 다시 읽어 칸이 원천 상태를 따르게 한다(INV-J13)
    router.refresh();
  }

  if (checkout) {
    if (!clientKey) {
      return <p role="alert">지금은 결제를 받을 수 없어요. 잠시 뒤 다시 시도해 주세요.</p>;
    }
    return (
      <PaymentStep
        clientKey={clientKey}
        pending={checkout}
        route={{ orderName: `팬꾹 선물 전달 ${checkout.orderNo}`, successPath: "/api/checkout/success", failPath: `/gifts/${encodeURIComponent(orderNo)}?payment=failed` }}
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
        {busy ? "준비하는 중…" : "결제하기"}
      </button>
    </div>
  );
}
