"use client";

import { ANONYMOUS, loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { useEffect, useRef, useState } from "react";

// 개발용 시험 결제 화면. 디자인 승인 전이라 꾸미지 않는다 — 결제 흐름이 끝까지 도는지만 본다.

type Pending = {
  orderId: string;
  orderNo: string;
  amountKrw: number;
  charge: { serviceFeeKrw: number; shippingFeeKrw: number };
};

const REASON_TEXT: Record<string, string> = {
  amount_mismatch: "금액이 서버 기록과 달라 승인하지 않았습니다",
  no_pending_payment: "결제 대기 기록이 없습니다(개발 서버를 재시작하면 기록이 사라집니다)",
  not_approved: "결제사가 승인하지 않았습니다",
  in_progress: "같은 결제를 이미 처리하는 중입니다",
  bad_input: "결제 정보가 빠졌습니다",
  user: "결제를 취소했거나 결제창에서 실패했습니다",
};

export function TestCheckout({ clientKey, result }: { clientKey: string; result: Record<string, string> }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    (async () => {
      try {
        const toss = await loadTossPayments(clientKey);
        const widgets = toss.widgets({ customerKey: ANONYMOUS });
        // 화면 금액은 서버가 정한 값을 그대로 쓴다. 바꿔도 승인 단계에서 서버가 거부한다(INV-M2).
        await widgets.setAmount({ currency: "KRW", value: pending.amountKrw });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#payment-methods" }),
          widgets.renderAgreement({ selector: "#agreement" }),
        ]);
        if (!cancelled) widgetsRef.current = widgets;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "결제 화면을 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientKey, pending]);

  async function start() {
    setError(null);
    const res = await fetch("/api/checkout", { method: "POST" });
    if (!res.ok) return setError("결제 대기를 만들지 못했습니다");
    setPending((await res.json()) as Pending);
  }

  async function pay() {
    if (!widgetsRef.current || !pending) return;
    await widgetsRef.current.requestPayment({
      orderId: pending.orderId,
      orderName: `팬꾹 선물 전달 ${pending.orderNo}`,
      successUrl: `${window.location.origin}/api/checkout/success`,
      failUrl: `${window.location.origin}/dev/checkout?result=fail&reason=user`,
    });
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
      <h1>시험 결제 (개발용)</h1>
      <p>테스트 키로 결제하므로 실제 돈은 나가지 않습니다.</p>

      {result.result === "done" && <p role="status">결제 완료: {result.orderId}</p>}
      {result.result === "fail" && (
        <p role="alert">결제 실패: {REASON_TEXT[result.reason ?? ""] ?? result.reason}</p>
      )}
      {error && <p role="alert">{error}</p>}

      {!pending ? (
        <button type="button" onClick={start}>
          시험 주문 만들기
        </button>
      ) : (
        <>
          <p>
            주문번호 {pending.orderNo} · 서비스료 {pending.charge.serviceFeeKrw.toLocaleString()}원 + 배송비{" "}
            {pending.charge.shippingFeeKrw.toLocaleString()}원 = {pending.amountKrw.toLocaleString()}원
          </p>
          <div id="payment-methods" />
          <div id="agreement" />
          <button type="button" onClick={pay}>
            결제하기
          </button>
        </>
      )}
    </main>
  );
}
