"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { RefundUnitKind } from "@/entities/payment/model/payment-rows";
import a from "@/shared/ui/admin.module.css";
import { postRefund } from "../api/post-refund-client";

// 환불 버튼 + 확인 창 (admin-console INV-K7, 시안 admin/payments.html 의 refund 창).
// 금액은 서버가 계산한 값을 보여 주기만 한다 — 입력칸이 없고 보내지도 않는다.
// 누르는 중에는 다시 누를 수 없다. 두 번 눌려도 서버·DB 가 결제사 취소를 한 번으로 막는다.

type Props = {
  unitKind: RefundUnitKind;
  unitId: string;
  orderNo: string;
  payerNickname: string;
  amountKrw: number;
  retry: boolean;
};

const won = new Intl.NumberFormat("ko-KR");

export function RefundButton({ unitKind, unitId, orderNo, payerNickname, amountKrw, retry }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `refund-title-${unitId}`;

  function open() {
    setError(null);
    dialog.current?.showModal();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postRefund(unitKind, unitId);
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
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
      <dialog ref={dialog} className={a.dialog} aria-labelledby={titleId}>
        <div className={a.dlgBody}>
          <h2 id={titleId}>{retry ? "환불을 다시 시도할까요?" : "이 주문을 환불할까요?"}</h2>
          <dl className={a.kv}>
            <dt>주문번호</dt>
            <dd className={a.mono}>{orderNo}</dd>
            <dt>결제한 사람</dt>
            <dd>{payerNickname}</dd>
          </dl>
          <div className={a.amount}>
            <span className={a.sub} style={{ fontSize: 13, display: "block" }}>
              돌려줄 금액 (서버가 계산한 값)
            </span>
            <b className={a.mono}>{won.format(amountKrw)}원</b>
          </div>
          <p className={a.hint}>
            금액은 사람이 바꿀 수 없어요. 같은 환불을 두 번 눌러도 결제사 취소는 한 번만 일어나요. 결제사 취소가 실패하면 「환불 실패」로 남고 다시 시도할 수 있어요.
          </p>
          <p role="status" style={{ fontSize: 14, fontWeight: 700, minHeight: 0 }}>
            {error}
          </p>
        </div>
        <div className={a.dlgFoot}>
          <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={() => dialog.current?.close()}>
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
