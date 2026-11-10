"use client";

import { useId, type RefObject } from "react";
import a from "@/shared/ui/admin.module.css";

// 요금을 올려 저장할 때 한 번 띄우는 30일 공지 확인 창 (ux pages/admin-pricing.md `raise_notice_confirm`).
// 저장을 막지 않는다 — 「요금 변경」은 폼의 저장 동작을 그대로 부른다. 「취소」·Esc 는 폼을 그대로 두고 닫는다.
// 모양은 운영자 화면의 다른 확인 창과 같다(제목 → 본문 → 버튼, design-prompt 8-7). 버튼 높이 44(8-12).
// 모달로 열어 창 밖은 누를 수 없고(showModal), 닫히면 초점을 저장 버튼으로 돌려보낸다.

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** 창이 닫힌 뒤 초점을 받을 저장 버튼 */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
};

export function RaiseNoticeDialog({ dialogRef, returnFocusRef, onConfirm }: Props) {
  const titleId = useId();
  return (
    <dialog ref={dialogRef} className={a.dialog} aria-labelledby={titleId} onClose={() => returnFocusRef.current?.focus()}>
      <div className={a.dlgBody}>
        <h2 id={titleId}>요금을 변경할까요?</h2>
        <p>손님에게 불리한 요금 변경은 30일 전에 공지해야 합니다(전자상거래 표준약관). 공지한 지 30일이 지났는지 확인해 주세요.</p>
        <p>저장하면 지금부터 새로 등록하는 선물에 바로 적용됩니다.</p>
      </div>
      <div className={a.dlgFoot}>
        <button type="button" className={`${a.btn} ${a.btnLg} ${a.btnLine}`} onClick={() => dialogRef.current?.close()}>
          취소
        </button>
        <button
          type="button"
          className={`${a.btn} ${a.btnLg}`}
          onClick={() => {
            dialogRef.current?.close();
            onConfirm();
          }}
        >
          요금 변경
        </button>
      </div>
    </dialog>
  );
}
