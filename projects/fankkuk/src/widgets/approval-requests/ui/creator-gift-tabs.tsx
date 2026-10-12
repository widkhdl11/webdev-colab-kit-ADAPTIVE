"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "./approval-requests.module.css";

// 승인·받은 선물 탭(시안 creator-received.html) — 확인할 선물이 있으면 가운데에 하나 더(2026-10-12 (2) D3 ②). 좌우 화살표로 옮겨 가고, 고른 탭만 Tab 순서에 남는다(선물 내역 탭과 같은 방식).
// 처음 고른 탭은 주소(?tab=received)로 정한다 — 서버가 넘긴다.

export type CreatorGiftTab = { id: "requests" | "checks" | "received"; label: string; count: number; panel: ReactNode };

/** 지금 받은 탭(given)을 기준으로, 전에 있었는데 빠진 탭은 그 자리에 수 0 으로 남긴다 */
function mergeTabs(remembered: readonly CreatorGiftTab[], given: readonly CreatorGiftTab[]): CreatorGiftTab[] {
  const out: CreatorGiftTab[] = [];
  let gi = 0;
  for (const old of remembered) {
    const fresh = given.find((t) => t.id === old.id);
    if (!fresh) {
      out.push({ ...old, count: 0 });
      continue;
    }
    // 새로 생긴 탭은 받은 순서대로 앞에 끼운다
    while (gi < given.length && given[gi]!.id !== old.id) {
      const g = given[gi]!;
      if (!remembered.some((r) => r.id === g.id)) out.push(g);
      gi += 1;
    }
    out.push(fresh);
    gi += 1;
  }
  for (; gi < given.length; gi += 1) if (!out.some((t) => t.id === given[gi]!.id)) out.push(given[gi]!);
  return out;
}

export function CreatorGiftTabs({ tabs: given, initial }: { tabs: readonly CreatorGiftTab[]; initial: CreatorGiftTab["id"] }) {
  // 이 화면에 있는 동안 보였던 탭은 새로 읽기(router.refresh)에서 빠져도 남긴다 — 확인할 선물의 마지막 상자에 답하면
  // 서버가 그 탭을 빼는데, 그 자리에 방금 고른 결과 문구가 남아 있어야 한다. 빠진 탭의 수는 0, 내용은 마지막 것 그대로.
  const [remembered, setRemembered] = useState<readonly CreatorGiftTab[]>(given);
  const tabs = mergeTabs(remembered, given);
  const tabsKey = tabs.map((t) => t.id).join(",");
  const rememberedKey = remembered.map((t) => t.id).join(",");
  useEffect(() => {
    if (tabsKey !== rememberedKey) setRemembered(tabs);
  }, [tabsKey, rememberedKey, tabs]);
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
