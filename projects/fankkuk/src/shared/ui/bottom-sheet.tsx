"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import b from "./bottom-sheet.module.css";

// 확인 창. 767px 이하는 화면 아래에서 올라오고, 768px 이상은 가운데 뜬다(시안 v4 creator-requests·creator-settings).
// 브라우저 기본 <dialog> 의 모달 모드를 써서 포커스가 창 안에 머물고 Esc 로 닫힌다.
// busy(서버에 보내는 중)이면 Esc·덮개·닫기 버튼으로 닫지 않는다 — 결과를 놓치지 않게. 브라우저가 그래도 닫으면(두 번째 Esc 등)
// close 이벤트로 onClose 가 불려 부르는 쪽 상태도 닫힘이 된다(열림으로 남지 않는다).
export function BottomSheet({
  open,
  title,
  meta,
  busy = false,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  /** 제목 아래 작은 글씨 한 줄(시안 .dlg-h .meta) — 없으면 그리지 않는다 */
  meta?: ReactNode;
  /** 처리 중 — 이 동안 Esc·덮개·닫기 버튼으로 닫지 않는다 */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={b.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault(); // 처리 중 Esc 는 닫지 않는다
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose(); // 덮개를 누르면 닫는다
      }}
    >
      <div className={b.body}>
        <span className={b.grip} aria-hidden="true" />
        <div className={b.head}>
          <div>
            <h2 id={titleId} className={b.title}>
              {title}
            </h2>
            {meta ? <p className={`t-meta ${b.meta}`}>{meta}</p> : null}
          </div>
          <button className={b.close} type="button" aria-label="닫기" disabled={busy} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
