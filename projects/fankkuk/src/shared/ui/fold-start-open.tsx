"use client";

import { useEffect } from "react";

// 처음부터 펼쳐 둔 접기(<details open data-start-open>)는 페이지를 열 때 등장 효과를 받지 않는다(design-prompt 12-3 「처음 열 때 움직이지 않는다」).
// 펼친 내용의 등장 규칙이 `details[open]:not([data-start-open])` 이라서다. 사람이 그 접기를 처음 접거나 펼치면 표시를 지워,
// 그 뒤로는 다른 접기와 똑같이 펼칠 때 나타난다(12-7). toggle 은 거품처럼 올라오지 않아 문서에서 잡는 단계(capture)로 한 번 듣는다.

export function clearStartOpen(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLDetailsElement && target.hasAttribute("data-start-open")) target.removeAttribute("data-start-open");
}

export function FoldStartOpen() {
  useEffect(() => {
    document.addEventListener("toggle", clearStartOpen, true);
    return () => document.removeEventListener("toggle", clearStartOpen, true);
  }, []);
  return null;
}
