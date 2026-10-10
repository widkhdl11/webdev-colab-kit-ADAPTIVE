// 크리에이터 받는 양 조절 — 화면 쪽 계산 (docs/specs/creator-receiving.md).
// 크리에이터 페이지와 등록 화면이 같은 함수를 쓴다(INV-B8). 등록 때의 판정은 DB 가 다시 한다(INV-B2·B4·B9) — 여기는 표시만.
// 날짜는 전부 한국 시간 달력 날짜다.

export type CalendarDate = { year: number; month: number; day: number };
export type MonthDay = { month: number; day: number };
export type Anniversary = { name: string; month: number; day: number };
export type Dday = { kind: "birthday" | "anniversary"; name: string; daysLeft: number };

/** 크리에이터의 공개 받는 상태 — 한도는 없다(INV-B6). resumeOn 은 쉬는 중일 때만(YYYY-MM-DD). */
export type CreatorReceiving = {
  resumeOn: string | null;
  birthday: MonthDay | null;
  anniversaries: readonly Anniversary[];
};

/** INV-B8: D-day 를 보여 주는 기간(그날 30일 전부터). */
export const DDAY_WINDOW_DAYS = 30;
/** INV-B9: 기념일 표시를 고를 수 있는 기간(D-7 ~ D-day). */
export const ANNIVERSARY_MARK_DAYS = 7;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 그 순간의 한국 시간 날짜. */
export function kstToday(now: Date): CalendarDate {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate() };
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function serial(d: CalendarDate): number {
  return Date.UTC(d.year, d.month - 1, d.day) / DAY_MS;
}

/** 그해의 그 월·일 — 2월 29일은 윤년이 아닌 해에 2월 28일로 친다(INV-B8). */
function inYear(year: number, md: MonthDay): CalendarDate {
  if (md.month === 2 && md.day === 29 && !isLeap(year)) return { year, month: 2, day: 28 };
  return { year, month: md.month, day: md.day };
}

/** 오늘부터 가장 가까운 그 월·일까지 남은 날(오늘이면 0). DB 의 receiving_next_date 와 같은 규칙. */
export function daysUntil(today: CalendarDate, md: MonthDay): number {
  const t = serial(today);
  const thisYear = serial(inYear(today.year, md));
  return thisYear >= t ? thisYear - t : serial(inYear(today.year + 1, md)) - t;
}

/**
 * INV-B8: 가장 가까운 생일·기념일 하나를 D-30 ~ D-day 동안. 같은 날이면 생일 먼저, 그다음 등록 순서(배열 순서).
 * 기간 밖이거나 아무것도 없으면 null.
 */
export function upcomingDday(today: CalendarDate, birthday: MonthDay | null, anniversaries: readonly Anniversary[]): Dday | null {
  const candidates: Dday[] = [
    ...(birthday ? [{ kind: "birthday" as const, name: "생일", daysLeft: daysUntil(today, birthday) }] : []),
    ...anniversaries.map((a) => ({ kind: "anniversary" as const, name: a.name, daysLeft: daysUntil(today, a) })),
  ];
  let best: Dday | null = null;
  for (const c of candidates) {
    if (c.daysLeft > DDAY_WINDOW_DAYS) continue;
    // 앞선 것이 이긴다(같은 날이면 바꾸지 않는다) — 생일이 먼저 들어 있고 기념일은 등록 순서다
    if (!best || c.daysLeft < best.daysLeft) best = c;
  }
  return best;
}

/** 「생일 D-12」·「데뷔일 D-day」. */
export function ddayLabel(d: Dday): string {
  return `${d.name} ${d.daysLeft === 0 ? "D-day" : `D-${d.daysLeft}`}`;
}

/** INV-B9: 기념일 7일 안(D-7 ~ D-day)이면 그 이름(둘이면 가까운 쪽, 같으면 등록 순서). 생일은 대상이 아니다. */
export function anniversaryInWeek(today: CalendarDate, anniversaries: readonly Anniversary[]): string | null {
  let best: { name: string; daysLeft: number } | null = null;
  for (const a of anniversaries) {
    const daysLeft = daysUntil(today, a);
    if (daysLeft > ANNIVERSARY_MARK_DAYS) continue;
    if (!best || daysLeft < best.daysLeft) best = { name: a.name, daysLeft };
  }
  return best?.name ?? null;
}

function parseIsoDate(iso: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/** INV-B2: 다시 받는 날이 오늘보다 뒤면 쉬는 중. 그날 0시부터는 받는 중. */
export function isResting(resumeOn: string | null, today: CalendarDate): boolean {
  const r = resumeOn ? parseIsoDate(resumeOn) : null;
  return r !== null && serial(r) > serial(today);
}

/** INV-B2: 쉬는 중 안내 — 「잠시 선물 받기를 쉬고 있어요. 10월 20일부터 다시 받을게요」. */
export function restingMessage(resumeOn: string): string {
  const r = parseIsoDate(resumeOn);
  const when = r ? `${r.month}월 ${r.day}일` : resumeOn;
  return `잠시 선물 받기를 쉬고 있어요. ${when}부터 다시 받을게요`;
}

/** 다음 달 1일. */
export function nextMonthFirst(today: CalendarDate): CalendarDate {
  return today.month === 12 ? { year: today.year + 1, month: 1, day: 1 } : { year: today.year, month: today.month + 1, day: 1 };
}

/** INV-B6: 한도에 닿은 팬에게 보이는 문구 하나 — 한도 숫자·남은 개수를 넣지 않는다. */
export function limitReachedMessage(today: CalendarDate): string {
  const n = nextMonthFirst(today);
  return `이번 달은 이미 마음을 충분히 보내셨어요. ${n.month}월 ${n.day}일부터 다시 보낼 수 있어요`;
}

/** 날짜에 n 일을 더한다. */
export function addDays(d: CalendarDate, n: number): CalendarDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day) + n * DAY_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** YYYY-MM-DD (날짜 입력 칸·DB date 와 같은 꼴). */
export function toIsoDate(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** INV-B3: 다시 받는 날로 고를 수 있는 범위 — 내일부터 오늘+365일까지. DB 저장 함수가 같은 범위로 다시 검사한다. */
export const RESUME_MAX_DAYS = 365;
export function resumeRange(today: CalendarDate): { min: string; max: string } {
  return { min: toIsoDate(addDays(today, 1)), max: toIsoDate(addDays(today, RESUME_MAX_DAYS)) };
}

/** INV-B5: 팬당 한 달 한도 — 꺼짐(null) 또는 1~10. */
export const MONTHLY_LIMIT_MAX = 10;
/** INV-B7: 기념일 최대 개수와 이름 길이. */
export const ANNIVERSARY_MAX = 3;
export const ANNIVERSARY_NAME_MAX = 12;

/** 크리에이터 본인 설정 화면의 값 — 한도는 본인에게만 보인다(INV-B6). */
export type MyCreatorReceiving = {
  resumeOn: string | null;
  monthlyLimit: number | null;
  birthday: MonthDay | null;
  anniversaries: readonly Anniversary[];
};

/** 그 달의 마지막 날(2월은 29일까지 고를 수 있다 — 2월 29일 생일·기념일, INV-B8). */
export function daysInMonth(month: number): number {
  return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
