import { formatDuration } from "@/shared/lib/format/datetime";

// 평균 승인 시간 한 줄 문구 — 선물 보내기·크리에이터 찾기·크리에이터 페이지·팔로우 목록이 같은 문구를 쓴다.
/** 분 → "평균 승인 약 2시간". 기록이 없으면 "아직 승인 기록이 없어요". */
export function approvalTimeText(minutes: number | null): string {
  return minutes === null ? "아직 승인 기록이 없어요" : `평균 승인 ${formatDuration(minutes)}`;
}

/** 분 → "약 2시간"(앞말 없이 — 크리에이터 페이지 요약 칸처럼 「평균 승인」이 따로 붙는 자리). 기록이 없으면 "아직 기록이 없어요". */
export function approvalDurationText(minutes: number | null): string {
  return minutes === null ? "아직 기록이 없어요" : formatDuration(minutes);
}
