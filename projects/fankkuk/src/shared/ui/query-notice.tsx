"use client";

import { useSearchParams } from "next/navigation";

// 처리에서 돌아온 직후 한 번만 보이는 한 줄 (2026-10-22 d113 진단 C-2·C-3). 돌아온 주소의 쿼리 값이 맞을 때만 그린다 —
// 같은 화면을 다른 길로 다시 열면 쿼리가 없어 사라진다. 결과를 저장하지 않는다. 문구는 쓰는 쪽이 넘긴다.
// useSearchParams 를 쓰므로 부르는 쪽이 Suspense 로 감싼다.

/** tone = 실패면 alert(바로 읽힘), 끝난 알림이면 status */
export function QueryNotice({ name, value, text, tone, className }: { name: string; value: string; text: string; tone: "alert" | "status"; className?: string }) {
  const params = useSearchParams();
  if (params?.get(name) !== value) return null;
  return (
    <p className={className} role={tone}>
      {text}
    </p>
  );
}
