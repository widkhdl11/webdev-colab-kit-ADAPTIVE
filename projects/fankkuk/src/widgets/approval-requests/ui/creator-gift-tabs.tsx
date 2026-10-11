"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "./approval-requests.module.css";

// 승인·받은 선물 두 탭(시안 creator-received.html). 좌우 화살표로 옮겨 가고, 고른 탭만 Tab 순서에 남는다(선물 내역 탭과 같은 방식).
// 처음 고른 탭은 주소(?tab=received)로 정한다 — 서버가 넘긴다.

export type CreatorGiftTab = { id: "requests" | "received"; label: string; count: number; panel: ReactNode };

export function CreatorGiftTabs({ tabs, initial }: { tabs: readonly CreatorGiftTab[]; initial: CreatorGiftTab["id"] }) {
  const [selected, setSelected] = useState(Math.max(0, tabs.findIndex((t) => t.id === initial)));
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const next = (n + tabs.length) % tabs.length;
    setSelected(next);
    buttons.current[next]?.focus();
  };

  return (
    <>
      <div className={s.tabs} role="tablist" aria-label="승인·받은 선물 구분">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            className={s.tab}
            role="tab"
            id={`gift-tab-${t.id}`}
            type="button"
            aria-selected={i === selected}
            aria-controls={`gift-panel-${t.id}`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
            <span className={s.n}>{t.count}</span>
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`gift-panel-${t.id}`} aria-labelledby={`gift-tab-${t.id}`} hidden={i !== selected}>
          {t.panel}
        </div>
      ))}
    </>
  );
}
