// 화면 표시용 시각 포맷. 기준 시간대는 서울(7일 규칙과 같은 기준).
const TZ = "Asia/Seoul";

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dateOnly = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "long", day: "numeric", weekday: "short" });

/** "10월 2일 오전 9:30" */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** "10월 4일 (일)" — YYYY-MM-DD 도 받는다 */
export function formatDate(isoOrDate: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00+09:00`) : new Date(isoOrDate);
  const parts = dateOnly.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}일 (${get("weekday")})`;
}

/** 분 → "약 40분" / "약 3시간" / "약 2일" */
export function formatDuration(minutes: number): string {
  // 반올림한 뒤 단위를 고른다 — 먼저 고르면 59.6분이 「약 60분」이 된다
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `약 ${m}분`;
  const h = Math.round(m / 60);
  if (h < 24) return `약 ${h}시간`;
  return `약 ${Math.round(h / 24)}일`;
}

const stamp = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "10-03 09:30" (서울 시각) — 관리자 표처럼 칸이 좁은 곳에 쓴다 */
export function formatStamp(iso: string): string {
  const parts = stamp.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** "10-03" (서울 날짜) */
export function formatMonthDay(iso: string): string {
  return formatStamp(iso).slice(0, 5);
}
