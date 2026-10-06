"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postCreatorVerify } from "../api/post-verify-client";

// 확인 대기 신청 「승인」 버튼 + 확인 창 (creator-verification INV-V6·V7, 시안 admin/creators.html 의 승인 대기 표).
// 시안에는 확인 창이 없었지만, 되돌리려면 「승인 취소」와 사유가 필요한 동작이라 반려·취소처럼 「승인할까요?」를 한 번 묻는다(2026-10-06).
// 신청 식별값만 보낸다. 두 사람이 동시에 눌러도 DB 가 한 번만 바꾸고 늦은 쪽은 「이미 처리됐어요」를 보고 표가 다시 읽힌다.

type Props = { applicationId: string; creatorName: string; returnFocusId: string; onDone: (text: string) => void };

export function ApproveButton({ applicationId, creatorName, returnFocusId, onDone }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `approve-${applicationId}-title`;
  const errorId = `approve-${applicationId}-error`;

  function open() {
    setError(null);
    dialog.current?.showModal();
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postCreatorVerify({ action: "approve", applicationId });
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      onDone(`${creatorName}님을 승인했어요.`);
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    if (isStaleFailure(outcome)) {
      // 이 줄은 다시 읽으면 표에서 사라질 수 있다 — 문구는 화면 쪽 알림 칸에 남긴다
      dialog.current?.close();
      onDone(`${creatorName}: ${outcome.message}`);
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm}`} onClick={open} aria-label={`${creatorName} 승인`}>
        승인
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
          <h2 id={titleId}>승인할까요?</h2>
          <p>
            <b>{creatorName}</b>님이 크리에이터 찾기에 나오고 팬의 선물·팔로우를 받을 수 있게 돼요. 되돌리려면 「승인 취소」와 사유가 필요해요. 누가 언제
            승인했는지 남아요.
          </p>
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
          <button type="button" className={a.btn} onClick={approve} aria-disabled={busy} aria-describedby={error ? errorId : undefined}>
            {busy ? "승인하는 중…" : "승인"}
          </button>
        </div>
      </dialog>
    </>
  );
}
