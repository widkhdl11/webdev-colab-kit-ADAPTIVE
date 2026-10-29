"use client";

import { useEffect, useState } from "react";

// 마감 시각까지 남은 시간 — 1초마다 다시 그린다. 화면 표시용이다(마감 판정은 서버·DB 가 한다).
// deadline 이 null 이면 시계를 멈추고 0 으로 둔다. maxSeconds 는 첫 그림에서 이전 시각으로 계산돼 길게 보이는 것을 막는다.

export type Countdown = { secondsLeft: number; expired: boolean; text: string };

/** 초를 「분:초」 두 자리씩(02:59) */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 지금 시각 기준 남은 초(올림) — 0 아래로 내려가지 않고 maxSeconds 를 넘지 않는다 */
export function secondsUntil(deadline: number, now: number, maxSeconds: number): number {
  return Math.min(maxSeconds, Math.max(0, Math.ceil((deadline - now) / 1000)));
}

export function useCountdown(deadline: number | null, maxSeconds: number): Countdown {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  if (deadline === null) return { secondsLeft: 0, expired: false, text: "" };
  const secondsLeft = secondsUntil(deadline, now, maxSeconds);
  return { secondsLeft, expired: secondsLeft === 0, text: mmss(secondsLeft) };
}
