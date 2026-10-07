"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postHeldReturn } from "../api/post-held-return-client";

// 「반송으로 넘기기」 버튼 + 확인 창 (inbound-address-code INV-C6·C9). 아직 이어지지 않은 보류 상자에만 부르는 쪽이 그린다.
// 넘기는 중에는 창을 닫을 수 없다(결과를 놓치지 않게). 누가 넘겼는지는 DB 가 남긴다.

type Props = { id: string; waybillNo: string | null };

export function ReturnHeldButton({ id, waybillNo }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `held-return-${id}`;
  const name = waybillNo ? `송장 ${waybillNo}` : "이 상자";

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postHeldReturn(id);
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
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
        className={`${a.btn} ${a.btnSm} ${a.btnSoft}`}
        aria-label={`${name} 반송으로 넘기기`}
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        반송으로 넘기기
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
          <h2 id={titleId}>반송으로 넘길까요?</h2>
          <p>
            <b className={a.mono}>{name}</b> 상자를 7일을 기다리지 않고 반송 대상으로 넘겨요. 원 송장 주소로 착불 반송하고, 넘긴 뒤에는 주인이 찾아도 이어지지 않아요.
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
          <button type="button" className={`${a.btn} ${a.btnInk}`} onClick={() => void confirm()} aria-disabled={busy}>
            {busy ? "넘기는 중…" : "반송으로 넘기기"}
          </button>
        </div>
      </dialog>
    </>
  );
}
