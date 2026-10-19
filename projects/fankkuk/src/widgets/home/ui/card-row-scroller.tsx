"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import s from "./front.module.css";

// ④-2 팔로우한 크리에이터 — 카드 줄을 옆으로 넘기고 양옆 화살표로 한 화면씩 옮긴다(2026-10-19 사용자 「양 옆으로 화살표로 누를 수 있게」).
// 끝에 닿은 쪽 화살표는 숨긴다. 768 이하는 화살표 없이 손가락·스크롤 막대로 넘긴다(그 폭은 바깥 여백이 16 이라 화살표가 화면을 넘는다). 카드 자체는 서버가 그린 그대로 받는다.

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

export function CardRowScroller({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const row = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // 누른 화살표가 끝에 닿아 숨으면 초점이 문서 맨 앞으로 튄다 — 숨기 전에 기억해 두고, 다시 그린 뒤 반대쪽 화살표로 옮긴다
  const prevBtn = useRef<HTMLButtonElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const refocus = useRef<"prev" | "next" | null>(null);

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    // 1px 여유 — 소수점 폭에서 끝에 닿았는데도 1px 남은 것으로 재는 일을 막는다
    const prev = el.scrollLeft > 1;
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    if (!next && document.activeElement === nextBtn.current) refocus.current = "prev";
    if (!prev && document.activeElement === prevBtn.current) refocus.current = "next";
    setCanPrev(prev);
    setCanNext(next);
  }, []);

  // 카드 수가 바뀌면 다시 잰다 — 「팔로우 취소」로 카드가 빠져도 줄 폭은 그대로라 크기 관찰기가 반응하지 않는다
  const count = Children.count(children);
  useEffect(() => {
    measure();
  }, [count, measure]);

  useEffect(() => {
    const target = refocus.current === "prev" && canPrev ? prevBtn.current : refocus.current === "next" && canNext ? nextBtn.current : null;
    refocus.current = null;
    target?.focus();
  }, [canPrev, canNext]);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  // 한 화면씩 — 양옆으로 넓힌 자리(안쪽 여백)를 뺀 카드 칸 폭만큼 옮기면 칸 맞춤(scroll-snap)이 카드 첫머리에 세운다
  const step = (dir: -1 | 1) => {
    const el = row.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const inner = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    el.scrollBy({ left: dir * inner, behavior: "smooth" });
  };

  return (
    <div className={s.scroller}>
      <button ref={prevBtn} type="button" className={`${s.rowArrow} ${s.rowPrev}`} aria-label="이전 크리에이터" aria-controls={id} hidden={!canPrev} onClick={() => step(-1)}>
        <Chevron dir="prev" />
      </button>
      <ul ref={row} id={id} className={`${s.cardRow} ${s.cardRowScroll}`} aria-label={label}>
        {children}
      </ul>
      <button ref={nextBtn} type="button" className={`${s.rowArrow} ${s.rowNext}`} aria-label="다음 크리에이터" aria-controls={id} hidden={!canNext} onClick={() => step(1)}>
        <Chevron dir="next" />
      </button>
    </div>
  );
}
