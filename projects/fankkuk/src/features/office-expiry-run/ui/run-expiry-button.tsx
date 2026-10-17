"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postExpiryRun } from "../api/post-expiry-client";
import { expiryRunSummary } from "../model/expiry-counts";

// 「지금 돌리기」 버튼 + 확인 창 (office-workflow INV-W6, 시안 admin/automation.html 의 run 창).
// 그 한 줄(주문번호)만 지금 처리한다. 새벽 자동 처리는 이미 한 일로 보고 건너뛴다 — 두 번 처리하지 않는 것은 DB 가 지킨다.
// 누르는 중에는 다시 누를 수도, 창을 닫을 수도 없다. 끝나면 창에 결과 한 줄(처분 대상·재알림 수, INV-W15)을 보이고, 창을 닫을 때 목록을 다시 읽는다.

type Props = { orderNo: string; returnFocusId: string };

export function RunExpiryButton({ orderNo, returnFocusId }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const titleId = `run-title-${orderNo}`;

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postExpiryRun({ orderNo });
    setBusy(false);
    if (outcome.kind === "ok") {
      const summary = expiryRunSummary(outcome.body);
      if (summary !== null) {
        setResult(summary);
        return;
      }
      dialog.current?.close();
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
        aria-label={`${orderNo} 지금 돌리기`}
        onClick={() => {
          setError(null);
          setResult(null);
          dialog.current?.showModal();
        }}
      >
        지금 돌리기
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClose={() => {
          if (result === null) return;
          setResult(null);
          document.getElementById(returnFocusId)?.focus();
          router.refresh();
        }}
      >
        <div className={a.dlgBody}>
          <h2 id={titleId}>지금 돌릴까요?</h2>
          <p>
            <b className={a.mono}>{orderNo}</b> 한 줄만 지금 처리해요. 새벽 자동 처리에서는 이미 한 일로 보고 건너뛰어요.
          </p>
          <div role="status">
            {result !== null && <p className={a.hint}>{result}</p>}
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
          {result === null && (
            <button type="button" className={a.btn} onClick={confirm} aria-disabled={busy}>
              {busy ? "돌리는 중…" : "지금 돌리기"}
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
