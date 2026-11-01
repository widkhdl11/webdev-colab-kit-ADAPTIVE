import type { ReactNode } from "react";

// 팬꾹 소개 화면의 선 아이콘 — lucide 경로 그대로(시안 v18/about.html 의 symbol). 36절(시안 about-20261101)에서 지키는 기준 표시를 × 에서 방패로 바꿨다. 장식이라 늘 aria-hidden
export type AboutIconName = "lock" | "unlock" | "shield" | "arrow";

const LOCK_BODY = <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />;

const SHAPES: Record<AboutIconName, ReactNode> = {
  lock: (
    <>
      {LOCK_BODY}
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  unlock: (
    <>
      {LOCK_BODY}
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
};

export function AboutIcon({ name }: { name: AboutIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {SHAPES[name]}
    </svg>
  );
}
