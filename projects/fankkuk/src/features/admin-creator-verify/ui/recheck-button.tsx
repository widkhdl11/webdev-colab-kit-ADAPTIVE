"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LINK_GRACE_DAYS, RECHECK_DAYS } from "@/entities/creator/model/creator-verification";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postCreatorVerify } from "../api/post-verify-client";

// 재확인 판정 「링크 있음」·「링크 없음」 버튼 + 확인 창 (creator-verification INV-V18·V20, 시안 channel-link-verify-20261102/admin.html #recheck·#grace).
// 크리에이터 식별값과 판정만 보낸다. 같은 크리에이터에 두 판정이 함께 와도 DB 가 하나만 반영하고 늦은 쪽은 「이미 처리됐어요」를 보고 표가 다시 읽힌다.

/** disabledReason: 이 판정을 지금 할 수 없는 이유(모델 recheckActions 가 정한다) — 있으면 버튼을 끄고 이유 한 줄을 붙인다 */
type Props = { creatorId: string; creatorName: string; found: boolean; disabledReason?: string | null; returnFocusId: string; onDone: (text: string) => void };

export function RecheckButton({ creatorId, creatorName, found, disabledReason = null, returnFocusId, onDone }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `recheck-${found ? "found" : "missing"}-${creatorId}`;
  const label = found ? "링크 있음" : "링크 없음";

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function decide() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postCreatorVerify({ action: "recheck", creatorId, found, memo: "" });
    setBusy(false);
    if (outcome.kind === "ok" || isStaleFailure(outcome)) {
      dialog.current?.close();
      onDone(outcome.kind === "ok" ? `${creatorName}: ${label}으로 처리했어요.` : `${creatorName}: ${outcome.message}`);
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
  }

  return (
    <>
      <button
        type="button"
        className={found ? `${a.btn} ${a.btnSm}` : `${a.btn} ${a.btnSm} ${a.btnLine}`}
        aria-disabled={disabledReason ? true : undefined}
        aria-describedby={disabledReason ? `${key}-why` : undefined}
        onClick={() => {
          if (disabledReason) return;
          setError(null);
          dialog.current?.showModal();
        }}
        aria-label={`${creatorName} ${label}`}
      >
        {label}
      </button>
      {disabledReason ? (
        <span className={a.hint} id={`${key}-why`}>
          {disabledReason}
        </span>
      ) : null}
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={`${key}-title`}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className={a.dlgBody}>
          <h2 id={`${key}-title`}>{label}으로 처리할까요?</h2>
          <p>
            {found ? (
              <>
                <b>{creatorName}</b>님의 다음 재확인은 {RECHECK_DAYS}일 뒤예요.
              </>
            ) : (
              <>
                <b>{creatorName}</b>님에게 {LINK_GRACE_DAYS}일 유예가 시작돼요. 그동안 「링크 있음」이 없으면 승인이 취소돼요.
              </>
            )}{" "}
            누가 언제 처리했는지 남아요.
          </p>
          <div role="status">
            {error && (
              <p className={a.errorLine} id={`${key}-error`}>
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
          <button type="button" className={a.btn} onClick={() => void decide()} aria-disabled={busy} aria-describedby={error ? `${key}-error` : undefined}>
            {busy ? "처리하는 중…" : label}
          </button>
        </div>
      </dialog>
    </>
  );
}
