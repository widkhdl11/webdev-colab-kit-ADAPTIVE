"use client";

import { ANONYMOUS, loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { useEffect, useId, useRef, useState } from "react";
import s from "./payment-step.module.css";

// 선물 등록 뒤 결제창. 금액은 서버가 등록 때 정한 값을 그대로 쓴다 — 여기서 바꿔도 승인 단계에서 서버가 거부한다(INV-M2).
// 결제가 끝나면 토스가 /api/checkout/success 로 돌려보내고, 서버가 승인한 뒤 선물 상세로 보낸다.

/** 결제창이 받는 값 — 등록이 돌려준 결제 orderId·주문번호·서버가 계산한 금액. */
export type CheckoutTarget = { orderId: string; orderNo: string; amountKrw: number };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 결제창이 돌아갈 주소와 주문 이름. 주지 않으면 팬 선물 전달 결제의 값을 쓴다(역조공은 자기 값을 넘긴다). */
export type CheckoutRoute = { orderName: string; successPath: string; failPath: string };

export function PaymentStep({ clientKey, pending, route }: { clientKey: string; pending: CheckoutTarget; route?: CheckoutRoute }) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  // 결제 SDK 가 이 id 를 CSS 선택자로 쓴다 — React 가 만든 id 의 특수 문자(«», :)는 선택자에서 깨지므로 영문·숫자만 남긴다
  const id = useId().replace(/[^A-Za-z0-9]/g, "");
  const methodsId = `pay-methods-${id}`;
  const agreementId = `pay-agreement-${id}`;

  // 결제수단 위젯은 한 화면에 하나만 그릴 수 있다. 개발 모드에서 React 가 효과를 두 번 돌리면(그리기 → 정리 → 다시 그리기)
  // 앞의 위젯이 남아 있어 두 번째 그리기가 거부된다 — 정리할 때 그린 위젯을 지우고, 그리기·지우기를 순서대로 잇는다.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const title = useRef<HTMLHeadingElement>(null);

  // 폼이 이 카드로 바뀌면 누른 버튼이 사라진다 — 포커스를 카드 제목으로 옮겨 바뀐 내용을 처음부터 읽게
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let rendered: { destroy(): Promise<void> }[] = [];
    queue.current = queue.current.then(async () => {
      if (cancelled) return;
      try {
        const toss = await loadTossPayments(clientKey);
        const widgets = toss.widgets({ customerKey: ANONYMOUS });
        await widgets.setAmount({ currency: "KRW", value: pending.amountKrw });
        rendered = await Promise.all([
          widgets.renderPaymentMethods({ selector: `#${methodsId}` }),
          widgets.renderAgreement({ selector: `#${agreementId}` }),
        ]);
        if (!cancelled) {
          widgetsRef.current = widgets;
          setReady(true);
        }
      } catch {
        if (!cancelled) setError("결제 화면을 불러오지 못했어요. 새로고침해 주세요.");
      }
    });
    return () => {
      cancelled = true;
      widgetsRef.current = null;
      queue.current = queue.current.then(async () => {
        await Promise.all(rendered.map((w) => w.destroy().catch(() => undefined)));
        rendered = [];
      });
    };
  }, [clientKey, pending.amountKrw, methodsId, agreementId]);

  async function pay() {
    if (!ready || !widgetsRef.current) return;
    setError(null);
    try {
      const to = route ?? { orderName: `팬꾹 선물 전달 ${pending.orderNo}`, successPath: "/api/checkout/success", failPath: "/gifts/new?payment=failed" };
      await widgetsRef.current.requestPayment({
        orderId: pending.orderId,
        orderName: to.orderName,
        successUrl: `${window.location.origin}${to.successPath}`,
        failUrl: `${window.location.origin}${to.failPath}`,
      });
    } catch {
      setError("결제를 마치지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <section className={s.section} aria-labelledby={`pay-h-${id}`}>
      <div className={s.card}>
        <h2 id={`pay-h-${id}`} className={s.title} ref={title} tabIndex={-1}>
          결제 수단을 골라 주세요
        </h2>
        <p className={s.sum}>
          <span>결제 금액</span>
          <strong>{won(pending.amountKrw)}</strong>
        </p>
        <div id={methodsId} />
        <div id={agreementId} />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <button
          className="btn btn--block"
          type="button"
          onClick={pay}
          aria-disabled={!ready}
          aria-busy={(!ready && error === null) || undefined}
        >
          {won(pending.amountKrw)} 결제하기
        </button>
      </div>
    </section>
  );
}
