"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ORDER_NO_PATTERN } from "@/entities/order/model/order-no";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import type { PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import { CANCEL_REASON_MAX, MESSAGE_ORDER_NO, MESSAGE_REASON } from "../model/cancel-received-gift";

// 대표의 주문 취소 양식 — 입고 뒤 취소(payment INV-M17)와 크리에이터 사정 취소(INV-M21)가 같은 꼴을 쓴다. 대표 화면에만 그린다(부르는 쪽이 고른다 — 최종 판정은 DB).
// 버튼을 누르면 주문번호·사유 칸이 열리고, 둘 다 적어 확인해야 취소된다. 양식이 닫히면(취소·저장) 포커스를 다시 보이는 버튼으로 돌려준다.

export type OrderCancelFormProps = {
  fieldId: string;
  title: string;
  hint: string;
  openLabel: string;
  reasonPlaceholder: string;
  submitLabel: string;
  doneText: (orderNo: string) => string;
  send: (write: { orderNo: string; reason: string }) => Promise<PostJsonOutcome>;
};

export function OrderCancelForm({ fieldId: FIELD_ID, title, hint, openLabel, reasonPlaceholder, submitLabel, doneText, send }: OrderCancelFormProps) {
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
    const outcome = await send({ orderNo: shapedNo, reason });
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
        <h2 id={`${FIELD_ID}-title`}>{title}</h2>
      </div>
      <p className={a.hint} id={`${FIELD_ID}-hint`} style={{ margin: "0 0 12px" }}>
        {hint}
      </p>
      <p role="status" className={a.doneLine}>
        {doneNo ? doneText(doneNo) : ""}
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
          {openLabel}
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
              placeholder={reasonPlaceholder}
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
              {busy ? "취소하는 중…" : submitLabel}
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
