import { Suspense } from "react";
import { QueryNotice } from "@/shared/ui/query-notice";

// 돌려받을 주소 확인 창이 끝나면 같은 선물 상세를 ?address=confirmed 로 다시 읽는다(진단 C-3) — 그때 한 번만 보이는 한 줄.
// 확인하면 그 할 일 줄이 원천 상태로 사라지므로(마지막 할 일이면 칸째) 할 일 칸 밖, 상세 맨 위에 둔다(ui-reviewer 2026-10-22 지적 1).
export const RETURN_CONFIRMED_TEXT = "반송 주소가 확인되었습니다.";

export function ReturnConfirmedNotice({ className }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <QueryNotice name="address" value="confirmed" text={RETURN_CONFIRMED_TEXT} tone="status" className={className} />
    </Suspense>
  );
}
