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

/**
 * "3분 전" 처럼 오늘 안의 시각까지 적는다. `relativeDay` 를 감싸는 것이라 어휘가 갈리지
 * 않는다 — 하루가 넘어가면 그쪽 문장("어제" · "3일 전")이 그대로 나온다.
 *
 * **알림에 이 함수를 쓰는 이유**는 오늘 온 것이 대부분이라서다. `relativeDay` 만 쓰면
 * 방금 온 알림과 아침에 온 알림이 둘 다 "오늘"이 되어, 목록의 순서 말고는 새것을 가릴
 * 방법이 없다.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  // 미래 시각(시계 어긋남)은 "방금"으로 접는다 — "-3분 전"을 보여 주지 않는다
  if (seconds < 60) return "방금";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}시간 전`;
  // 이레까지는 「어제」·「3일 전」이 지금과의 거리를 그대로 말해 준다. 그 뒤로는 「9일 전」이
  // 날짜보다 덜 읽히므로 날짜로 바꾼다 — 해가 바뀌면 연도까지 적는다(승인 시안의 규칙).
  if (seconds < 7 * 86_400) return relativeDay(iso, now);
  return then.getFullYear() === now.getFullYear() ? formatMonthDay(iso) : formatDate(iso);
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

/** "2026-09-21" → "2026년 9월 21일". 값이 없으면 빈 문자열 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** "9월 3일" — 연도가 필요 없는 자리(올린 날짜 등) */
export function formatMonthDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 시작일–종료일과 몇 주인지. 한쪽만 있으면 있는 쪽만 적는다 */
export function formatPeriod(startsOn: string | null, endsOn: string | null): string {
  const from = formatDate(startsOn);
  const to = formatDate(endsOn);
  if (!from && !to) return "정하지 않음";
  if (from && !to) return `${from}부터`;
  if (!from && to) return `${to}까지`;

  const weeks = Math.round(
    (new Date(endsOn as string).getTime() - new Date(startsOn as string).getTime()) /
      (7 * 86_400_000),
  );
  return weeks > 0 ? `${from} – ${to} (${weeks}주)` : `${from} – ${to}`;
}

/** "매주 화·목 20:00 – 22:00". 시각이 여럿이면 요일마다 따로 적는다 */
export function formatSlotsLong(
  slots: readonly { weekday: number; startsAt: string; endsAt: string }[],
): string {
  if (slots.length === 0) return "정하지 않음";

  const spans = new Set(slots.map((s) => `${hourMinute(s.startsAt)} – ${hourMinute(s.endsAt)}`));
  const sorted = [...slots].sort(
    (a, b) => a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt),
  );

  if (spans.size === 1) {
    const days = [...new Set(sorted.map((s) => WEEKDAY_NAMES[s.weekday]))].join("·");
    return `매주 ${days} ${[...spans][0]}`;
  }
  return sorted
    .map((s) => `${WEEKDAY_NAMES[s.weekday]} ${hourMinute(s.startsAt)} – ${hourMinute(s.endsAt)}`)
    .join(" · ");
}

/** 오늘부터 며칠 남았는가. 지났으면 음수 */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}
