"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import s from "./creator-profile.module.css";

// 추천 크리에이터 둘러보기(시안 creator-detail-e-20261112 「승인 뒤 변경」 — 2026-11-12 사용자 「양쪽에 화살표가 있는 자동 슬라이드」).
// 한 번에 3장(휴대폰 2장), 카드 줄 바깥 양옆 화살표 44(좁은 칸은 본문 안, 휴대폰은 화살표 없이 손으로 넘김), 5초마다 한 장, 처음↔끝 순환.
// design-prompt 10-4: 멈춤/다시 시작 버튼 + 마우스를 올린 동안·초점이 안에 있는 동안·손으로 넘긴 뒤·탭이 안 보일 때 멈춤.
// 12-3: 「움직임 줄이기」면 멈춘 채 시작하고 넘김도 바로(부드러운 이동 없음). 「손대지 않아도 움직이는 것 금지」는 사용자 지시로 어긴다.
// 넘길 것이 없으면(한 화면 3장 이하) 화살표·멈춤 버튼을 그리지 않고 움직이지 않는다.

const AUTO_MS = 5000;
const PER_VIEW = 3;

function Arrow({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function SimilarCarousel({ count, children }: { count: number; children: ReactNode }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const movable = count > PER_VIEW;
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const [docHidden, setDocHidden] = useState(false);
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setCalm(q.matches);
    if (q.matches) setPaused(true);
    // 보는 도중에 「움직임 줄이기」를 켜도 자동 넘김을 멈춘다(UX 리뷰 11-13) — 끄는 쪽은 사용자가 멈춤 버튼으로 다시 시작
    const onChange = () => {
      setCalm(q.matches);
      if (q.matches) setPaused(true);
    };
    q.addEventListener("change", onChange);
    const onVis = () => setDocHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      q.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      const tr = trackRef.current;
      if (!tr) return;
      const behavior: ScrollBehavior = calm ? "auto" : "smooth";
      const atEnd = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 2;
      const atStart = tr.scrollLeft < 2;
      if (dir > 0 && atEnd) tr.scrollTo({ left: 0, behavior });
      else if (dir < 0 && atStart) tr.scrollTo({ left: tr.scrollWidth, behavior });
      else {
        const card = tr.querySelector("li");
        const gap = parseFloat(getComputedStyle(tr).columnGap) || 0;
        tr.scrollBy({ left: dir * ((card?.getBoundingClientRect().width ?? tr.clientWidth) + gap), behavior });
      }
    },
    [calm],
  );

  const running = movable && !paused && !hold && !docHidden;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => go(1), AUTO_MS);
    return () => window.clearInterval(timer);
  }, [running, go]);

  return (
    <section
      className={s.similar}
      aria-labelledby="similar-title"
      aria-roledescription="carousel"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      <div className={s.secHead}>
        <h2 className={s.secTitle} id="similar-title">
          추천 크리에이터 둘러보기
        </h2>
        <div className={s.secTools}>
          {movable ? (
            <button type="button" className={s.opause} aria-pressed={paused} aria-label={paused ? "자동 넘김 다시 시작" : "자동 넘김 멈추기"} onClick={() => setPaused((p) => !p)}>
              {paused ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
                  <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
                </svg>
              )}
            </button>
          ) : null}
          <Link className="more-link" href="/creators">
            전체 보기
          </Link>
        </div>
      </div>
      <div className={movable ? s.ocar : undefined}>
        {movable ? (
          <button type="button" className={s.oarrow} aria-label="이전 크리에이터" aria-controls="similar-track" onClick={() => go(-1)}>
            <Arrow d="m15 6-6 6 6 6" />
          </button>
        ) : null}
        <ul className={s.ogrid} id="similar-track" ref={trackRef} aria-live="off" onPointerDown={() => setPaused(true)}>
          {children}
        </ul>
        {movable ? (
          <button type="button" className={s.oarrow} aria-label="다음 크리에이터" aria-controls="similar-track" onClick={() => go(1)}>
            <Arrow d="m9 6 6 6-6 6" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
