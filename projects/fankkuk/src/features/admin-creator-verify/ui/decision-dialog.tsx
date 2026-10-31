"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { VERIFICATION_MEMO_MAX } from "@/entities/creator/model/creator-verification";
import { useFormDraft } from "@/shared/lib/form-draft/use-form-draft";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postCreatorVerify } from "../api/post-verify-client";
import type { CreatorVerificationDecision } from "../model/decide-creator-verification";

// 반려·승인 취소·횟수 풀기가 같이 쓰는 확인 창 (시안 admin/creators.html 의 cancel 창과 같은 모양).
// 사유 목록이 있으면 하나를 골라야 보낸다(INV-V9). 메모는 운영자끼리만 보고 200자까지(DB 와 같은 기준으로 센다).
// 처리 중에는 창을 닫을 수 없다(결과를 놓치지 않게). 다른 사람이 먼저 처리했으면 문구를 보이고 표를 다시 읽는다.

type Props<R extends string> = {
  /** 버튼과 창의 식별값 앞부분 — 한 화면에 여러 개가 있어도 겹치지 않게 */
  idBase: string;
  buttonLabel: string;
  buttonAriaLabel: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  reasons: readonly R[] | null;
  reasonLabels: Record<R, string> | null;
  memoLabel: string;
  memoPlaceholder: string;
  decision: (reasonCode: R | null, memo: string) => CreatorVerificationDecision;
  doneText: string;
  returnFocusId: string;
  onDone: (text: string) => void;
};

export function DecisionDialog<R extends string>(p: Props<R>) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<R | null>(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `${p.idBase}-title`;
  const memoId = `${p.idBase}-memo`;
  const errorId = `${p.idBase}-error`;
  const memoCount = charCount(memo.trim());
  const memoBad = memoCount > VERIFICATION_MEMO_MAX;
  const labels = p.reasonLabels;
  // 고른 사유·메모 임시 저장(session-login INV-L20) — 창마다 따로. 창이 닫히면(닫기·Esc·처리 성공) 지운다.
  // 창 안의 칸을 폼 하나로 묶으려고 감싼다 — display: contents 라 배치는 그대로다
  const formRef = useRef<HTMLFormElement>(null);
  const { clear } = useFormDraft(formRef, `admin-creator-verify:${p.idBase}`);

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
    if (p.reasons && reason === null) {
      setError("사유를 하나 골라 주세요.");
      return;
    }
    if (memoBad) {
      setError(`메모는 ${VERIFICATION_MEMO_MAX}자까지 적을 수 있어요.`);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postCreatorVerify(p.decision(reason, memo));
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      setReason(null);
      setMemo("");
      p.onDone(p.doneText);
      document.getElementById(p.returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={open} aria-label={p.buttonAriaLabel}>
        {p.buttonLabel}
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClose={clear}
      >
        <form ref={formRef} style={{ display: "contents" }} noValidate onSubmit={(e) => e.preventDefault()}>
        <div className={a.dlgBody}>
          <h2 id={titleId}>{p.title}</h2>
          {p.body}
          {p.reasons && labels ? (
            <fieldset className={a.field} style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={error ? errorId : undefined}>
              <legend className={a.fieldLabel}>사유 (크리에이터에게 보여요)</legend>
              {p.reasons.map((r) => (
                <label key={r} className={a.check}>
                  <input type="radio" name={`${p.idBase}-reason`} value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {labels[r]}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className={a.field}>
            <label htmlFor={memoId}>{p.memoLabel}</label>
            <textarea
              id={memoId}
              className={a.textarea}
              style={{ minHeight: 80 }}
              placeholder={p.memoPlaceholder}
              aria-describedby={error ? `${memoId}-count ${errorId}` : `${memoId}-count`}
              aria-invalid={memoBad}
              value={memo}
              onChange={(e) => {
                setMemo(e.target.value);
                setError(null);
              }}
            />
            <span className={a.count} id={`${memoId}-count`}>
              {memoCount} / {VERIFICATION_MEMO_MAX}
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
          <button type="button" className={`${a.btn} ${a.btnInk}`} onClick={confirm} aria-disabled={busy}>
            {busy ? p.busyLabel : p.confirmLabel}
          </button>
        </div>
        </form>
      </dialog>
    </>
  );
}
