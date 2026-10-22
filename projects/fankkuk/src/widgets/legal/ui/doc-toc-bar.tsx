"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TocGroup } from "../model/doc-nav";
import { FrequentBadge } from "./doc-parts";
import s from "./doc-page.module.css";

// 화면 위에 붙는 목차 줄(D1 ② — 왼쪽 따라오는 목차 대신, 모든 폭에서 같은 모양). 높이 44.
// 「지금 읽는 조 이름」 + 「목차 열기」. 펼치면 전체 조 · 지금 조 강조(aria-current) · 「자주 찾음」 · 약관의 주제 묶음 제목.
// 칩으로 가린 조는 흐리게 남고, 누르면 「전체」로 돌아가 그 조를 보인다. Esc · 바깥 누름으로 닫히고 초점은 「목차 열기」로.

type Props = {
  groups: readonly TocGroup[];
  current: string | null;
  hidden: ReadonlySet<string>;
  frequent: ReadonlySet<string>;
  onGo: (id: string) => void;
};

export function DocTocBar({ groups, current, hidden, frequent, onGo }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const items = groups.flatMap((g) => g.items);
  const now = items.find((i) => i.id === current) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap || wrap.contains(e.target as Node)) return;
      // 초점이 목차 안에 있었을 때만 「목차 열기」로 돌린다 — 바깥의 검색칸 등을 누른 초점은 빼앗지 않는다
      const focusInside = wrap.contains(document.activeElement);
      setOpen(false);
      if (focusInside) btnRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // 펼친 목록이 화면보다 길면 목록 칸 안에서 스크롤된다 — 지금 조 줄이 보이게 칸만 움직인다(페이지는 그대로)
  useEffect(() => {
    const panel = panelRef.current;
    const link = panel?.querySelector<HTMLElement>("[aria-current]");
    if (!open || !panel || !link) return;
    const top = link.offsetTop - panel.offsetTop;
    if (top < panel.scrollTop || top + link.offsetHeight > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = Math.max(0, top - panel.clientHeight / 2);
    }
  }, [open, current]);

  if (!now) return null;

  return (
    <div ref={wrapRef} className={s.bar}>
      <div className={s.barRow}>
        <p className={s.barNow} title={now.label}>
          {now.label}
        </p>
        <button
          ref={btnRef}
          type="button"
          className={s.barBtn}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "목차 닫기" : "목차 열기"}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <nav ref={panelRef} id={panelId} className={s.panel} aria-label="목차" hidden={!open}>
        {groups.map((g, gi) => (
          <div key={g.title ?? `rest-${gi}`} className={s.tocGroup}>
            {g.title ? <p className={s.tocGroupT}>{g.title}</p> : null}
            {g.items.map((item) => (
              <a
                key={item.id}
                className={`${s.tocLink}${hidden.has(item.id) ? ` ${s.dim}` : ""}`}
                href={`#${item.id}`}
                aria-current={item.id === now.id ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onGo(item.id);
                }}
              >
                <span className={s.tocLabel}>{item.label}</span>
                {frequent.has(item.id) ? <FrequentBadge /> : null}
              </a>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
