"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postProhibited } from "../api/post-prohibited-client";

// 금지 물품 「지우기」 버튼 + 확인 창 (admin-console INV-K9, 시안 admin/prohibited.html 의 del 창).
// 지우는 중에는 창을 닫을 수 없다(결과를 놓치지 않게). 지운 기록은 DB 가 남긴다.

type Props = {
  itemId: string;
  itemName: string;
  /** 창이 닫힌 뒤 포커스를 보낼 곳 — 성공하면 이 버튼이 표에서 사라지기 때문이다 */
  returnFocusId: string;
  /** 지운 뒤 화면 쪽 알림 칸에 띄울 문구를 넘긴다 */
  onDone: (text: string) => void;
};

export function DeleteProhibitedButton({ itemId, itemName, returnFocusId, onDone }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `prohibited-del-${itemId}`;

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
    const outcome = await postProhibited({ kind: "delete", id: itemId });
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      onDone(`「${itemName}」 항목을 지웠어요.`);
      document.getElementById(returnFocusId)?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh(); // 다른 사람이 먼저 지웠으면 표를 다시 읽는다
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnSoft}`} onClick={open} aria-label={`${itemName} 지우기`}>
        지우기
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
          <h2 id={titleId}>목록에서 지울까요?</h2>
          <p>
            「<b>{itemName}</b>」 항목을 지우면 크리에이터 페이지에서도 바로 사라져요. 지운 기록은 남아요.
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
          <button type="button" className={`${a.btn} ${a.btnInk}`} onClick={confirm} aria-disabled={busy}>
            {busy ? "지우는 중…" : "지우기"}
          </button>
        </div>
      </dialog>
    </>
  );
}
