"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import b from "./bottom-sheet.module.css";

// 화면 아래에서 올라오는 확인 창. 브라우저 기본 <dialog> 의 모달 모드를 써서
// 포커스가 창 안에 머물고 Esc 로 닫힌다.
export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // 덮개를 누르면 닫는다
      }}
    >
      <div className={b.body}>
        <span className={b.handle} aria-hidden="true" />
        <h2 id={titleId} className={b.title}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
