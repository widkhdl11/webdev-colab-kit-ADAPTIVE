"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postCreatorVerify } from "../api/post-verify-client";
import { REVOKE_REASON_MAX } from "../model/set-creator-verified";

// 크리에이터 「승인 취소」 버튼 + 확인 창 (admin-console INV-K10, 시안 admin/creators.html 의 cancel 창).
// 사유는 적지 않아도 된다(200자까지, DB 와 같은 기준으로 센다). 누가 언제 취소했는지는 DB 가 남긴다.
// 처리 중에는 창을 닫을 수 없다(결과를 놓치지 않게).

type Props = { creatorId: string; creatorName: string; returnFocusId: string; onDone: (text: string) => void };

export function RevokeButton({ creatorId, creatorName, returnFocusId, onDone }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `revoke-title-${creatorId}`;
  const reasonId = `revoke-reason-${creatorId}`;
  const errorId = `revoke-error-${creatorId}`;
  const reasonCount = charCount(reason.trim());
  const reasonBad = reasonCount > REVOKE_REASON_MAX;

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
    if (reasonBad) {
      setError(`사유는 ${REVOKE_REASON_MAX}자까지 적을 수 있어요.`);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await postCreatorVerify({ creatorId, verified: false, reason });
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      setReason("");
      onDone(`${creatorName}님의 승인을 취소했어요.`);
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh(); // 다른 사람이 먼저 처리했으면 표를 다시 읽는다
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={open} aria-label={`${creatorName} 승인 취소`}>
        승인 취소
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className={a.dlgBody}>
          <h2 id={titleId}>승인을 취소할까요?</h2>
          <p>
            <b>{creatorName}</b>님이 팬의 크리에이터 찾기에서 사라지고, 새 선물 등록과 팔로우가 막혀요. 이미 등록된 주문은 그대로 가요. 누가 언제 취소했는지 남아요.
          </p>
          <div className={a.field}>
            <label htmlFor={reasonId}>사유 (적지 않아도 돼요)</label>
            <textarea
              id={reasonId}
              className={a.textarea}
              style={{ minHeight: 80 }}
              placeholder="예: 인증 코드가 게시물에서 사라짐"
              aria-describedby={error ? `${reasonId}-count ${errorId}` : `${reasonId}-count`}
              aria-invalid={reasonBad}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
            />
            <span className={a.count} id={`${reasonId}-count`}>
              {reasonCount} / {REVOKE_REASON_MAX}
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
            {busy ? "취소하는 중…" : "승인 취소"}
          </button>
        </div>
      </dialog>
    </>
  );
}
