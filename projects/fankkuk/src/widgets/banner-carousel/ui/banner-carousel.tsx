"use client";

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import { bannerTone, type BannerView } from "@/entities/banner/model/banner";
import { BannerSlide } from "@/entities/banner/ui/banner-slide";
import s from "./banner-carousel.module.css";

// 광고 배너 넘김 칸 — 첫 화면·팬 홈 칸 ②, 크리에이터 홈, 크리에이터 찾기(design-rules 16절 ②, 시안 v27-home-airy compose.js 의 wideBanner).
// 본문보다 넓은 칸에 가운데 한 장 + 양옆 이전·다음 장이 흐리고 작게. 아래 줄 ‹ · 점 · 멈춤 · ›(767 이하는 ‹ › 를 빼고 점·멈춤만).
// docs/specs/banners.md:
// - INV-Y8: 받은 순서 그대로 보인다. 0장이면 아무것도 그리지 않는다(부르는 쪽도 bannerSlot 으로 칸을 두지 않는다).
// - INV-Y9: 저절로 넘어가면 멈춤 버튼이 늘 보인다. 움직임 줄이기 설정이면 멈춘 채로 시작한다(눌러서 켤 수는 있다).
//   마우스가 올라가 있거나 키보드 초점이 칸 안에 있는 동안에는 넘어가지 않는다.
// 장 바탕은 파스텔 8색을 보이는 순서대로 돌려 쓴다. 보이지 않는 장은 inert — 링크가 키보드로 닿지 않는다.

/** 저절로 넘어가는 간격(design-rules 16절 ②) */
export const BANNER_INTERVAL_MS = 6000;

/** 지금 장을 0 으로 두고 i 번째 장이 몇 칸 옆인가 — 양옆으로 고르게(셋이면 -1·0·+1) */
function offsetOf(i: number, current: number, n: number): number {
  const half = Math.floor(n / 2);
  return ((((i - current + n + half) % n) + n) % n) - half;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function BannerCarousel({ banners }: { banners: readonly BannerView[] }) {
  const n = banners.length;
  const [current, setCurrent] = useState(0);
  /** null = 아직 누르지 않았다 → 움직임 줄이기 설정을 따른다 */
  const [pausedByUser, setPausedByUser] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  const [hover, setHover] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const lastOffsets = useRef<Record<string, number>>({});
  /** 방금 마우스·손가락으로 눌렀나 — 눌러서 생긴 초점은 넘김을 막지 않는다(키보드 초점만 막는다) */
  const pointerFocus = useRef(false);

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const stopped = pausedByUser ?? reduced;
  const running = n > 1 && !stopped && !hover && !focusInside;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setCurrent((c) => (c + 1) % n), BANNER_INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [running, current, n]);

  const offsets = Object.fromEntries(banners.map((b, i) => [b.id, offsetOf(i, current, n)]));
  useEffect(() => {
    lastOffsets.current = offsets;
  });

  if (n === 0) return null;
  const shown = Math.min(current, n - 1);

  function onFocus() {
    if (!pointerFocus.current) setFocusInside(true);
  }
  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInside(false);
  }
  const go = (i: number) => setCurrent(((i % n) + n) % n);

  return (
    <div className={s.slot} data-banner-slot="">
      <section
        className={s.wide}
        aria-roledescription="carousel"
        aria-label="팬꾹 소식과 크리에이터 광고"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onPointerDown={() => {
          // 누름 바로 뒤에 오는 초점만 눌러서 생긴 것으로 본다
          pointerFocus.current = true;
          window.setTimeout(() => {
            pointerFocus.current = false;
          }, 0);
        }}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <div className={s.track}>
          {banners.map((b, i) => {
            const d = offsets[b.id]!;
            const before = lastOffsets.current[b.id];
            const on = i === shown;
            return (
              <div
                key={b.id}
                className={s.item}
                style={{ "--d": d } as CSSProperties}
                data-side={Math.abs(d) === 1 ? "true" : undefined}
                data-far={Math.abs(d) > 1 ? "true" : undefined}
                // 끝에서 처음으로 돌아가는 장은 가운데를 가로질러 날아가지 않게 움직임 없이 옮긴다
                data-jump={before !== undefined && Math.abs(before - d) > 1 ? "true" : undefined}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${n}`}
                aria-hidden={on ? undefined : true}
                inert={!on}
                data-banner-current={String(on)}
              >
                <BannerSlide banner={b} tone={bannerTone(i)} />
                {on && n > 1 ? (
                  <span className={s.count} data-banner-count="" aria-hidden="true">
                    {i + 1} / {n}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {n > 1 ? (
          <div className={s.bar}>
            <button type="button" className={`${s.btn} ${s.step}`} aria-label="이전 배너" onClick={() => go(shown - 1)}>
              <Icon d="m14 6-6 6 6 6" />
            </button>
            <div className={s.dots} role="group" aria-label="배너 고르기">
              {banners.map((b, i) => (
                <button key={b.id} type="button" className={s.dot} aria-label={`${i + 1}번 배너`} aria-current={i === shown ? "true" : undefined} onClick={() => go(i)} />
              ))}
            </div>
            <button type="button" className={s.btn} aria-label="자동 넘김 멈추기" aria-pressed={stopped} data-banner-pause="" onClick={() => setPausedByUser(!stopped)}>
              {stopped ? <Icon d="M8 5.5v13l11-6.5z" /> : <Icon d="M9 6v12M15 6v12" />}
            </button>
            <button type="button" className={`${s.btn} ${s.step}`} aria-label="다음 배너" onClick={() => go(shown + 1)}>
              <Icon d="m10 6 6 6-6 6" />
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
