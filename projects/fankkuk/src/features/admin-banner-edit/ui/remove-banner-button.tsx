"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postBannerRemove } from "../api/banner-client";

// 배너 「내리기」 버튼 + 페이지 안 확인 창 (docs/specs/banners.md INV-Y1·Y10 — 브라우저 확인 창은 쓰지 않는다).
// 내리는 중에는 창을 닫을 수 없다(결과를 놓치지 않게). 내린 기록은 DB 가 남긴다. 금지 물품 「지우기」 창과 같은 모양이다.

type Props = { bannerId: string; bannerTitle: string; onDone: (text: string) => void };

export function RemoveBannerButton({ bannerId, bannerTitle, onDone }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `banner-remove-${bannerId}`;

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
    const outcome = await postBannerRemove(bannerId);
    setBusy(false);
    if (outcome.kind === "ok") {
      dialog.current?.close();
      onDone(`「${bannerTitle}」 배너를 내렸어요.`);
      document.getElementById("banner-title")?.focus();
      router.refresh();
      return;
    }
    setError(outcome.message);
    if (isStaleFailure(outcome)) router.refresh(); // 다른 사람이 먼저 내렸으면 표를 다시 읽는다
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSoft}`} onClick={open}>
        내리기
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
          <h2 id={titleId}>배너를 내릴까요?</h2>
          <p>
            「<b>{bannerTitle}</b>」 배너를 내리면 모든 화면에서 바로 사라져요. 내린 기록은 남아요.
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
            {busy ? "내리는 중…" : "내리기"}
          </button>
        </div>
      </dialog>
    </>
  );
}
