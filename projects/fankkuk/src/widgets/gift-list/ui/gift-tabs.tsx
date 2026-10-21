"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// 선물 내역 분류 탭. 좌우 화살표로 옮겨 가고, 고른 탭만 Tab 순서에 남는다(시안 site.js 5절).
export type GiftTab = { id: string; label: string; panel: ReactNode };

export function GiftTabs({ tabs }: { tabs: readonly GiftTab[] }) {
  const [selected, setSelected] = useState(0);
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
      <div className="tabs tabs--line" role="tablist" aria-label="보낸 선물 분류">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            className="tab"
            role="tab"
            id={`tab-${t.id}`}
            type="button"
            aria-selected={i === selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={i !== selected}>
          {t.panel}
        </div>
      ))}
    </>
  );
}
