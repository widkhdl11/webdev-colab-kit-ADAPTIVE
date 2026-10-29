"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { LogoMark } from "@/shared/ui/logo";
import s from "./unfollow-dialog.module.css";

// 팔로우 취소 확인 창 — 시안 docs/design/mockups/site/v21-addendum3/fan-unfollow-modal.html (design-rules 12절).
// 열면 「계속 팔로우」에 초점, Tab 은 창 안에서만 돈다(브라우저 주소창으로도 나가지 않게 처음·끝에서 되감는다).
// Esc·바깥 누름·「계속 팔로우」는 그냥 닫고, 창을 연 버튼으로 초점을 돌려보낸다. 「팔로우 취소」만 onConfirm 을 부른다.
// 창 밖 화면은 <dialog>.showModal() 이 막는다(뒤 화면은 눌리지도 읽히지도 않는다).

type Pending = { onConfirm: () => void; opener: HTMLElement | null };

export function useUnfollowConfirm(): { ask: (name: string, onConfirm: () => void) => void; dialog: ReactNode } {
  const ref = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [name, setName] = useState("");
  const uid = useId(); // 한 화면에 창이 여럿(찾기 목록의 줄마다)이어도 이름표 id 가 겹치지 않게

  const ask = useCallback((who: string, onConfirm: () => void) => {
    const active = document.activeElement;
    pendingRef.current = { onConfirm, opener: active instanceof HTMLElement ? active : null };
    setName(who);
    ref.current?.showModal();
    keepRef.current?.focus();
  }, []);

  // 닫힐 때 늘 여기를 지난다(Esc 의 기본 닫힘 포함) — 연 버튼이 아직 화면에 있으면 그리로 초점을 돌려보낸다
  const onClose = () => {
    const opener = pendingRef.current?.opener;
    pendingRef.current = null;
    if (opener?.isConnected) opener.focus();
  };

  const confirm = () => {
    const pending = pendingRef.current;
    ref.current?.close();
    pending?.onConfirm();
  };

  // 바깥(어두운 면) 누름 — <dialog> 자체가 눌린 경우만. 안쪽 칸은 .box 가 받는다
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) ref.current?.close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled])")];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const dialog = (
    <dialog ref={ref} className={s.dialog} aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`} onClose={onClose} onClick={onBackdrop} onKeyDown={onKeyDown}>
      <div className={s.box}>
        <LogoMark size={56} />
        <h2 id={`${uid}-t`} className={s.title}>
          팔로우를 취소할까요?
        </h2>
        <p id={`${uid}-d`} className={s.desc}>
          {name}님을 팔로우 목록에서 삭제합니다.
        </p>
        <div className={s.actions}>
          <button className="btn btn--line" type="button" onClick={confirm}>
            팔로우 취소
          </button>
          <button ref={keepRef} className="btn" type="button" onClick={() => ref.current?.close()}>
            계속 팔로우
          </button>
        </div>
      </div>
    </dialog>
  );

  return { ask, dialog };
}
