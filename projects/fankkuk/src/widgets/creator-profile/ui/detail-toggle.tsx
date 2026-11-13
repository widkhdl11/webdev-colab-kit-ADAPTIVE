"use client";

import { useId, useState, type ReactNode } from "react";
import s from "./creator-profile.module.css";

// 상세 내용 여닫기(시안 creator-detail-e-20261112 — 2026-11-12 사용자 확정 「기본은 접힌 상태로」).
// 상단 묶음 바로 아래 가로 선 가운데 알약 버튼. 처음엔 닫힘. 닫힌 동안 안쪽은 hidden 이라 보이지도 읽히지도 않는다.
export function DetailToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className={s.detail}>
      <div className={s.dtoggleRow}>
        <button type="button" className={s.dtoggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          <span>{open ? "상세 정보 접기" : "상세 정보 펼치기"}</span>
          <svg className={s.dchev} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      <div className={s.dbody} id={bodyId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
