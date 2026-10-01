import { formatDuration } from "@/shared/lib/format/datetime";

// 평균 승인 시간 한 줄 문구 — 선물 보내기·크리에이터 찾기·크리에이터 페이지·팔로우 목록이 같은 문구를 쓴다.
/** 분 → "평균 승인 약 2시간". 기록이 없으면 "아직 승인 기록이 없어요". */
export function approvalTimeText(minutes: number | null): string {
  return minutes === null ? "아직 승인 기록이 없어요" : `평균 승인 ${formatDuration(minutes)}`;
}
