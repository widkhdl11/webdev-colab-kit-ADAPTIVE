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

const deadline = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hour12: true });

/** "10월 8일 오전 10시" / "10월 8일 오후 3시 30분" — 알림 본문의 기한처럼 문장 안에 넣는 시각 */
export function formatDeadline(iso: string): string {
  const parts = deadline.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const minute = Number(get("minute"));
  return `${get("month")}월 ${get("day")}일 ${get("dayPeriod")} ${get("hour")}시${minute ? ` ${minute}분` : ""}`;
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

const monthDayKo = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "10월 12일" (서울 날짜) — 문장·칸 안의 날짜 */
export function formatMonthDayKo(iso: string): string {
  const parts = monthDayKo.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}월 ${get("day")}일`;
}

/** "10월 15일 14:20" (서울 시각) */
export function formatMonthDayTimeKo(iso: string): string {
  const parts = monthDayKo.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}월 ${get("day")}일 ${get("hour")}:${get("minute")}`;
}

/** "10-03" (서울 날짜) */
export function formatMonthDay(iso: string): string {
  return formatStamp(iso).slice(0, 5);
}

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** 서울 날짜로 센 남은 날 수 — 기한 날짜 − 오늘 날짜(시각은 보지 않는다). 10월 18일 오후 11시 59분 기한을 16일에 보면 2 */
export function seoulDaysUntil(dueIso: string, nowIso: string): number {
  const day = (iso: string) => Date.parse(`${dayKey.format(new Date(iso))}T00:00:00Z`);
  return Math.round((day(dueIso) - day(nowIso)) / 86_400_000);
}

const yearMonth = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/** 서울 달 "2026-10" — 달마다 묶는 목록의 열쇠. YYYY-MM-DD 도 받는다 */
export function seoulYearMonth(isoOrDate: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00+09:00`) : new Date(isoOrDate);
  const parts = yearMonth.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/** 달 묶음 머리 "10월" — 기준 달과 해가 다르면 "2025년 12월" */
export function monthHeadKo(yearMonthKey: string, baseYearMonth: string): string {
  const [y, m] = yearMonthKey.split("-");
  const month = `${Number(m)}월`;
  return y === baseYearMonth.split("-")[0] ? month : `${y}년 ${month}`;
}

/** "오후 2:02" (서울 시각) — 날짜로 묶은 표의 시각 칸 */
export function formatTimeKo(iso: string): string {
  return timeOnly.format(new Date(iso));
}
