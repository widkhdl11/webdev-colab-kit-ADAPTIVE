"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { RefundUnitKind } from "@/entities/payment/model/payment-rows";
import { useFormDraft } from "@/shared/lib/form-draft/use-form-draft";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postManualRefund } from "../api/post-manual-refund-client";

// 「직접 환불함」 버튼 + 확인 창 (admin-console INV-K7 S7d, 카드 d126). 환불 확인 창(refund-button)과 같은 모양이다.
// 결제사를 부르지 않는다 — 팬꾹 밖에서 돌려준 것을 완료로 적기만 한다. 금액 입력은 없고, 메모는 필수(1~200자)다.
// 누르는 중에는 다시 누를 수도, 창을 닫을 수도 없다. 판정(대표·상태·메모 숫자·잠금)은 DB 가 한다.

const MEMO_MAX = 200;

type Props = {
  unitKind: RefundUnitKind;
  unitId: string;
  orderNo: string;
  payerNickname: string;
  /** 기록된 환불액. 목록이 금액을 모르면(역조공 몫 목록) null */
  amountKrw: number | null;
  /** 창의 사람 칸 이름(기본 「결제한 사람」) */
  payerLabel?: string;
  /** 창이 닫힌 뒤 포커스를 보낼 곳 — 성공하면 이 버튼이 표에서 사라지기 때문이다 */
  returnFocusId: string;
};

const won = new Intl.NumberFormat("ko-KR");

export function ManualRefundButton({ unitKind, unitId, orderNo, payerNickname, amountKrw, payerLabel = "결제한 사람", returnFocusId }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [memoBad, setMemoBad] = useState(false);
  const base = useId();
  const titleId = `${base}-title`;
  const memoId = `${base}-memo`;
  const errorId = `${base}-error`;
  // DB 와 같은 기준 — 앞뒤 빈칸을 뺀 글자 수
  const memoCount = charCount(memo.trim());
  // 메모 임시 저장(session-login INV-L20) — 환불 건마다 따로. 창이 닫히면(닫기·Esc·처리 성공) 지운다.
  // 창 안의 칸을 폼 하나로 묶으려고 감싼다 — display: contents 라 배치는 그대로다. 칸 id 는 화면마다 달라질 수 있어 name 으로 저장한다
  const formRef = useRef<HTMLFormElement>(null);
  const { clear } = useFormDraft(formRef, `admin-manual-refund:${unitKind}:${unitId}`);

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
    setMemoBad(false);
    const outcome = await postManualRefund(unitKind, unitId, memo);
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      setMemo("");
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    setMemoBad(outcome.field === "memo");
    router.refresh(); // 이미 완료·처리 중처럼 그 사이 바뀐 상태가 표에 바로 보이게
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={open} aria-label={`${orderNo} 직접 환불함`}>
        직접 환불함
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault(); // 처리 중에는 Esc 로도 닫히지 않는다
        }}
        onClose={clear}
      >
        <form ref={formRef} style={{ display: "contents" }} noValidate onSubmit={(e) => e.preventDefault()}>
        <div className={a.dlgBody}>
          <h2 id={titleId}>직접 돌려준 환불을 완료로 적을까요?</h2>
          <dl className={a.kv}>
            <dt>주문번호</dt>
            <dd className={a.mono}>{orderNo}</dd>
            <dt>{payerLabel}</dt>
            <dd>{payerNickname}</dd>
          </dl>
          <div className={a.amount}>
            <span className={a.amountLabel}>환불 금액 (기록된 값)</span>
            {amountKrw === null ? <b>기록된 금액 그대로 적어요</b> : <b className={a.mono}>{won.format(amountKrw)}원</b>}
          </div>
          <p className={a.hint}>
            결제사 관리 화면에서 이 결제가 이미 취소됐는지 먼저 확인해 주세요. 결제사에 닿지 못해 실패한 기록은 실제로는 취소됐을 수 있어요. 완료로 적으면 고치거나 되돌릴 수 없어요.
          </p>
          <div className={a.field}>
            <label htmlFor={memoId}>메모 (어떻게 돌려줬는지, 필수)</label>
            <textarea
              id={memoId}
              name="memo"
              className={a.textarea}
              style={{ minHeight: 80 }}
              aria-required="true"
              placeholder="예: 10월 24일 결제사 관리 화면에서 취소, 승인번호 12345678"
              aria-describedby={error ? `${memoId}-hint ${memoId}-count ${errorId}` : `${memoId}-hint ${memoId}-count`}
              aria-invalid={memoBad || memoCount > MEMO_MAX}
              value={memo}
              onChange={(e) => {
                setMemo(e.target.value);
                setError(null);
                setMemoBad(false);
              }}
            />
            <span className={a.hint} id={`${memoId}-hint`}>
              이름·연락처·계좌번호는 쓰지 마세요.
            </span>
            <span className={a.count} id={`${memoId}-count`}>
              {memoCount} / {MEMO_MAX}
            </span>
          </div>
          <div role="status">
            {error && (
              <p className={a.errorLine} id={errorId}>
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
            {busy ? "적는 중…" : "완료로 적기"}
          </button>
        </div>
        </form>
      </dialog>
    </>
  );
}
