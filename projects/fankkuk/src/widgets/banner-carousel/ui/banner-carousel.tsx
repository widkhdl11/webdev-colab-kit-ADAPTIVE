"use client";

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from "react";
import { bannerTone, type BannerView } from "@/entities/banner/model/banner";
import { BannerSlide } from "@/entities/banner/ui/banner-slide";
import s from "./banner-carousel.module.css";

// 광고 배너 넘김 칸 — 첫 화면·팬 홈 칸 ②, 크리에이터 홈, 크리에이터 찾기(design-rules 16절 ②, 시안 v27-home-airy compose.js 의 wideBanner).
// 본문보다 넓은 칸에 가운데 한 장 + 양옆 이전·다음 장이 흐리고 작게. 아래 줄 ‹ · 점 · 멈춤 · ›(767 이하는 ‹ › 를 빼고 점·멈춤만).
// docs/specs/banners.md:
// - INV-Y8: 받은 순서 그대로 보인다. 0장이면 아무것도 그리지 않는다(부르는 쪽도 bannerSlot 으로 칸을 두지 않는다).
//   장 수가 줄어도(새 목록) 지금 장 번호는 장 수로 나눈 나머지 하나로 센다 — 보이는 장과 가운데 자리가 어긋나지 않게.
// - INV-Y9: 저절로 넘어가면 멈춤 버튼이 늘 보인다. 움직임 줄이기 설정이면 멈춘 채로 시작한다(눌러서 켤 수는 있다).
//   마우스가 올라가 있거나(손가락 누름은 아니다) 키보드 초점이 칸 안에 있는 동안에는 넘어가지 않는다.
//   저절로 넘어가는 동안에는 장 묶음을 읽기 프로그램에 알리지 않고(aria-live off), 멈추면 알린다(polite).
// 장 바탕은 파스텔 8색을 보이는 순서대로 돌려 쓴다. 보이지 않는 장은 inert — 링크가 키보드로 닿지 않는다.
// 두 장일 때: 다른 장이 한쪽에만 보이면 가운데 장이 치우쳐 보여 반대쪽에 그 장의 장식 복사본(링크·id 없음)을 둔다.
//   「다음」은 세 장 이상처럼 오른쪽에서 들어온다 — 다른 장은 평소 오른쪽(+1)에 서 있고, 넘어가는 동안 나간 장이 왼쪽으로 간 뒤
//   움직임 없이 오른쪽 자리로 돌아간다(복사본이 왼쪽을 채워 겉모습은 같다). 「이전」은 들어올 장을 먼저 왼쪽에 세운 뒤 넘긴다.

/** 저절로 넘어가는 간격(design-rules 16절 ②) */
export const BANNER_INTERVAL_MS = 6000;

/** 넘김 움직임 길이(CSS .item transition 0.45s) 조금 뒤 — 두 장일 때 나간 장을 제자리로 옮기는 때 */
const SETTLE_MS = 500;

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
  /** 두 장일 때 다른 장이 선 쪽 — 평소 +1(오른쪽) */
  const [otherSide, setOtherSide] = useState<1 | -1>(1);
  /** null = 아직 누르지 않았다 → 움직임 줄이기 설정을 따른다 */
  const [pausedByUser, setPausedByUser] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  const [hover, setHover] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const lastOffsets = useRef<Record<string, number>>({});
  /** 방금 마우스·손가락으로 눌렀나 — 눌러서 생긴 초점은 넘김을 막지 않는다(키보드 초점만 막는다) */
  const pointerFocus = useRef(false);
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  /** 지금 장 — 장 수가 줄었어도 이 값 하나로 센다 */
  const shown = n === 0 ? 0 : current % n;
  const stopped = pausedByUser ?? reduced;
  const running = n > 1 && !stopped && !hover && !focusInside;

  function next() {
    setCurrent((c) => ((c % n) + 1) % n);
    if (n !== 2) return;
    setOtherSide(-1); // 나간 장은 왼쪽으로
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setOtherSide(1), SETTLE_MS);
  }

  function prev() {
    if (n !== 2) {
      setCurrent((c) => ((c % n) - 1 + n) % n);
      return;
    }
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    setOtherSide(-1); // 들어올 장을 먼저 왼쪽에(복사본과 자리만 바뀌어 겉모습은 같다)
    window.requestAnimationFrame(() => {
      setCurrent((c) => ((c % n) + 1) % n);
      setOtherSide(1); // 나간 장은 오른쪽으로
    });
  }

  function pick(i: number) {
    if (i === shown) return;
    if (n === 2) next();
    else setCurrent(i);
  }

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(next, BANNER_INTERVAL_MS);
    return () => window.clearTimeout(t);
    // next 는 그릴 때마다 새로 만들어지지만 하는 일은 n·지금 장에만 기댄다
  }, [running, shown, n]);

  const offsets = Object.fromEntries(banners.map((b, i) => [b.id, n === 2 ? (i === shown ? 0 : otherSide) : offsetOf(i, shown, n)]));
  useEffect(() => {
    lastOffsets.current = offsets;
  });

  if (n === 0) return null;
  const other = n === 2 ? 1 - shown : null;

  function onFocus() {
    if (!pointerFocus.current) setFocusInside(true);
  }
  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInside(false);
  }
  const isMouse = (e: PointerEvent<HTMLElement>) => e.pointerType === "mouse";

  return (
    <div className={s.slot} data-banner-slot="">
      <section
        className={s.wide}
        aria-roledescription="carousel"
        aria-label="팬꾹 소식과 크리에이터 광고"
        onPointerEnter={(e) => {
          if (isMouse(e)) setHover(true);
        }}
        onPointerLeave={(e) => {
          if (isMouse(e)) setHover(false);
        }}
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
        <div className={s.track} aria-live={running ? "off" : "polite"} data-banner-track="">
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
          {other !== null ? (
            <div
              key="mirror"
              className={s.item}
              style={{ "--d": -otherSide } as CSSProperties}
              data-side="true"
              data-jump="true"
              aria-hidden="true"
              inert
              data-banner-mirror=""
            >
              <BannerSlide banner={banners[other]!} tone={bannerTone(other)} decorative />
            </div>
          ) : null}
        </div>
        {n > 1 ? (
          <div className={s.bar}>
            <button type="button" className={`${s.btn} ${s.step}`} aria-label="이전 배너" onClick={prev}>
              <Icon d="m14 6-6 6 6 6" />
            </button>
            <div className={s.dots} role="group" aria-label="배너 고르기">
              {banners.map((b, i) => (
                <button key={b.id} type="button" className={s.dot} aria-label={`${i + 1}번 배너`} aria-current={i === shown ? "true" : undefined} onClick={() => pick(i)} />
              ))}
            </div>
            <button type="button" className={s.btn} aria-label="자동 넘김 멈추기" aria-pressed={stopped} data-banner-pause="" onClick={() => setPausedByUser(!stopped)}>
              {stopped ? <Icon d="M8 5.5v13l11-6.5z" /> : <Icon d="M9 6v12M15 6v12" />}
            </button>
            <button type="button" className={`${s.btn} ${s.step}`} aria-label="다음 배너" onClick={next}>
              <Icon d="m10 6 6 6-6 6" />
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
