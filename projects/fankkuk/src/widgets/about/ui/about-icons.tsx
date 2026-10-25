import type { ReactNode } from "react";

// 팬꾹 소개 화면의 선 아이콘 — lucide 경로 그대로(시안 v18/about.html 의 symbol, part7 에서 단계·검수 아이콘을 뺐다). 장식이라 늘 aria-hidden
export type AboutIconName = "lock" | "unlock" | "x" | "arrow";

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
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
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
