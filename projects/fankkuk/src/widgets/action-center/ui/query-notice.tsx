"use client";

import { useSearchParams } from "next/navigation";

// 처리에서 돌아온 직후 한 번만 보이는 한 줄 (2026-10-22 d113 진단 C-2·C-3). 돌아온 주소의 쿼리 값이 맞을 때만 그린다 —
// 같은 상세를 다른 길로 다시 열면 쿼리가 없어 사라진다. 결과를 저장하지 않는다.
//   C-2 결제 이어 하기 실패: 결제창이 실패 주소(그 선물 상세 ?payment=failed)로 돌려보낸다 → 칸 위 「결제를 마치지 못했어요. 다시 결제해 주세요.」
//   C-3 돌려받을 주소 확인: 확인 창이 끝나면 ?address=confirmed 로 다시 읽는다 → 「돌려받을 주소를 확인했어요.」

export const RESUME_FAILED_TEXT = "결제를 마치지 못했어요. 다시 결제해 주세요.";
export const RETURN_CONFIRMED_TEXT = "돌려받을 주소를 확인했어요.";

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
