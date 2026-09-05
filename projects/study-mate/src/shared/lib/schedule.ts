/** 요일 0=일 … 6=토. 데이터베이스의 `weekday` 와 같은 약속이다. */
export const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type Slot = {
  /** 0(일) ~ 6(토) */
  readonly weekday: number;
  /** "20:00:00" 또는 "20:00" */
  readonly startsAt: string;
};

const isWeekday = (n: number) => Number.isInteger(n) && n >= 0 && n <= 6;

/** "20:00:00" → "20:00". 범위 밖이거나 모양이 다르면 받은 값을 그대로 돌려준다. */
export function hourMinute(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * 여러 슬롯을 한 줄로: "화·목 20:00". 시각이 여럿이면 요일마다 붙여
 * "화 06:30 · 목 20:00" 로 적는다 — 하나로 뭉뚱그리면 틀린 시각을 보여주게 된다.
 */
export function formatSlots(slots: readonly Slot[]): string {
  const valid = slots.filter((s) => isWeekday(s.weekday));
  if (valid.length === 0) return "일정 미정";

  const times = new Set(valid.map((s) => hourMinute(s.startsAt)));
  const sorted = [...valid].sort(
    (a, b) => a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt),
  );

  if (times.size === 1) {
    const days = [...new Set(sorted.map((s) => WEEKDAY_NAMES[s.weekday]))].join("·");
    return `${days} ${[...times][0]}`;
  }
  return sorted.map((s) => `${WEEKDAY_NAMES[s.weekday]} ${hourMinute(s.startsAt)}`).join(" · ");
}

/** "2일 전" 처럼 대략만 적는다. 목록에서 정확한 초는 읽는 사람에게 쓸모가 없다. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}
