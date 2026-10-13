"use client";

import { useEffect, useRef } from "react";

// 1023px 이하에서 메뉴는 가로로 밀리는 칩 줄이다. 뒤쪽 메뉴(주소와 설정·열람 기록 등)를 열면
// 그 칩이 화면 밖에 있어 지금 어디인지 안 보였다(2026-10-09 디자인 점검) — 열릴 때 그 칩을 줄 가운데로 민다.
// 페이지 세로 위치는 건드리지 않게 줄의 scrollLeft 만 바꾼다(scrollIntoView 는 페이지도 움직인다).
export function CurrentChipIntoView() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const row = ref.current?.closest("nav")?.querySelector("ul");
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
  }, []);
  return <span ref={ref} hidden />;
}
