"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ORDER_NO_PATTERN } from "@/entities/order/model/order-no";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postReceivedGiftCancel } from "../api/post-order-cancel-client";
import { CANCEL_REASON_MAX, MESSAGE_ORDER_NO, MESSAGE_REASON } from "../model/cancel-received-gift";

// 대표의 입고 뒤 취소 (payment INV-M17). 대표 화면에만 그린다(부르는 쪽이 고른다 — 최종 판정은 DB).
// 버튼을 누르면 주문번호·사유 칸이 열리고, 둘 다 적어 확인해야 취소된다. 환불 금액은 DB 가 도착한 상자의 칸을 빼서 정한다.
// 양식이 닫히면(취소·저장) 포커스를 다시 보이는 버튼으로 돌려준다.

const FIELD_ID = "received-cancel";

export function ReceivedCancelForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orderNo, setOrderNo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "orderNo" | "reason" | null; message: string } | null>(null);
  const [doneNo, setDoneNo] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusToggleNext = useRef(false);
  useEffect(() => {
    if (open || !focusToggleNext.current) return;
    focusToggleNext.current = false;
    toggleRef.current?.focus();
  }, [open]);
  const close = () => {
    focusToggleNext.current = true;
    setOpen(false);
    setOrderNo("");
    setReason("");
    setError(null);
  };
  const shapedNo = orderNo.trim().toUpperCase();
  const count = charCount(reason.trim());
  const reasonValid = count >= 1 && count <= CANCEL_REASON_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!ORDER_NO_PATTERN.test(shapedNo)) {
      setError({ field: "orderNo", message: MESSAGE_ORDER_NO });
      return;
    }
    if (!reasonValid) {
      setError({ field: "reason", message: MESSAGE_REASON });
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postReceivedGiftCancel({ orderNo: shapedNo, reason });
    setBusy(false);
    if (outcome.kind === "failed") {
      setError({ field: null, message: outcome.message });
      if (isStaleFailure(outcome)) router.refresh();
      return;
    }
    setDoneNo(shapedNo);
    close();
    router.refresh(); // 그 주문 줄이 「환불 대기」로 바뀌게 다시 읽는다
  }

  const describedBy = (own: string) => (error ? `${own} ${FIELD_ID}-error` : own);

  return (
    <section className={a.card} aria-labelledby={`${FIELD_ID}-title`}>
      <div className={a.sectionH}>
        <h2 id={`${FIELD_ID}-title`}>입고 뒤 취소</h2>
      </div>
      <p className={a.hint} id={`${FIELD_ID}-hint`} style={{ margin: "0 0 12px" }}>
        1:1 문의로 받은 입고 뒤 취소예요. 도착한 상자의 검수비·반송 택배비를 뺀 금액이 환불 대기로 올라와요.
      </p>
      <p role="status" className={a.doneLine}>
        {doneNo ? `${doneNo} 주문을 취소했어요. 환불 대기 줄에서 환불해 주세요.` : ""}
      </p>
      {!open ? (
        <button
          ref={toggleRef}
          type="button"
          className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
          onClick={() => {
            setDoneNo(null);
            setOpen(true);
          }}
        >
          입고 뒤 취소하기
        </button>
      ) : (
        <form className={a.stack} style={{ gap: 8 }} onSubmit={submit} noValidate>
          <div className={a.field}>
            <label htmlFor={`${FIELD_ID}-no`}>주문번호</label>
            <input
              id={`${FIELD_ID}-no`}
              className={a.input}
              type="text"
              autoFocus
              autoComplete="off"
              placeholder="예: FC-7K3M9"
              aria-describedby={describedBy(`${FIELD_ID}-hint`)}
              aria-invalid={error?.field === "orderNo"}
              value={orderNo}
              onChange={(e) => {
                setOrderNo(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className={a.field}>
            <label htmlFor={`${FIELD_ID}-reason`}>취소 사유</label>
            <input
              id={`${FIELD_ID}-reason`}
              className={a.input}
              type="text"
              placeholder="예: 1:1 문의로 입고 뒤 취소 요청"
              aria-describedby={describedBy(`${FIELD_ID}-count`)}
              aria-invalid={count > CANCEL_REASON_MAX || error?.field === "reason"}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
            />
            <span className={a.count} id={`${FIELD_ID}-count`}>
              {count} / {CANCEL_REASON_MAX}
            </span>
          </div>
          <div role="status">
            {error && (
              <p className={a.errorLine} id={`${FIELD_ID}-error`}>
                <span className={a.errorMark} aria-hidden="true">
                  !
                </span>
                {error.message}
              </p>
            )}
          </div>
          <div className={a.btnRow}>
            <button type="submit" className={`${a.btn} ${a.btnSm} ${a.btnInk}`} aria-disabled={busy}>
              {busy ? "취소하는 중…" : "취소하고 환불 대기로"}
            </button>
            <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={close}>
              닫기
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
