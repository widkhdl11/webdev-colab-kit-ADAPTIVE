"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { RefundUnitKind } from "@/entities/payment/model/payment-rows";
import a from "@/shared/ui/admin.module.css";
import { postRefund } from "../api/post-refund-client";

// 환불 버튼 + 확인 창 (admin-console INV-K7, 시안 admin/payments.html 의 refund 창).
// 금액은 서버가 계산한 값을 보여 주기만 한다 — 입력칸이 없고 보내지도 않는다.
// 누르는 중에는 다시 누를 수도, 창을 닫을 수도 없다(결과를 놓치지 않게). 두 번 눌려도 서버·DB 가 결제사 취소를 한 번으로 막는다.

type Props = {
  unitKind: RefundUnitKind;
  unitId: string;
  orderNo: string;
  payerNickname: string;
  amountKrw: number;
  retry: boolean;
  /** 창이 닫힌 뒤 포커스를 보낼 곳 — 성공하면 이 버튼이 표에서 사라지기 때문이다 */
  returnFocusId: string;
};

const won = new Intl.NumberFormat("ko-KR");

export function RefundButton({ unitKind, unitId, orderNo, payerNickname, amountKrw, retry, returnFocusId }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `refund-title-${unitId}`;

  function open() {
    setError(null);
    dialog.current?.showModal();
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postRefund(unitKind, unitId);
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    router.refresh(); // 실패·처리 중 상태가 표에 바로 보이게
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm}`} onClick={open} aria-label={`${orderNo} ${retry ? "환불 다시 시도" : "환불"}`}>
        {retry ? "다시 시도" : "환불"}
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault(); // 처리 중에는 Esc 로도 닫히지 않는다
        }}
      >
        <div className={a.dlgBody}>
          <h2 id={titleId}>{retry ? "환불을 다시 시도할까요?" : "이 주문을 환불할까요?"}</h2>
          <dl className={a.kv}>
            <dt>주문번호</dt>
            <dd className={a.mono}>{orderNo}</dd>
            <dt>결제한 사람</dt>
            <dd>{payerNickname}</dd>
          </dl>
          <div className={a.amount}>
            <span className={a.amountLabel}>돌려줄 금액 (서버가 계산한 값)</span>
            <b className={a.mono}>{won.format(amountKrw)}원</b>
          </div>
          <p className={a.hint}>
            금액은 사람이 바꿀 수 없어요. 같은 환불을 두 번 눌러도 결제사 취소는 한 번만 일어나요. 결제사 취소가 실패하면 「환불 실패」로 남고 다시 시도할 수 있어요.
          </p>
          <div role="status">
            {error && (
              <p className={a.errorLine}>
                <span className={a.errorMark} aria-hidden="true">
                  !
                </span>
                {error}
              </p>
            )}
          </div>
        </div>
        <div className={a.dlgFoot}>
          <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={close} aria-disabled={busy}>
            닫기
          </button>
          <button type="button" className={a.btn} onClick={confirm} aria-disabled={busy}>
            {busy ? "환불하는 중…" : "환불 실행"}
          </button>
        </div>
      </dialog>
    </>
  );
}
