/**
 * 달력 날짜·상대시각 포맷. 도메인 지식은 없다(어느 프로젝트에 옮겨도 동작한다).
 *
 * 기준 시간대를 분 단위 오프셋으로 받아 UTC 로 환산해 계산한다.
 * 실행 환경(서버/브라우저)의 로컬 시간대에 기대지 않기 위해서다 —
 * 서버와 클라이언트가 다른 시간대면 같은 값이 다른 날짜로 갈라진다.
 */

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** 한국 표준시(UTC+9). 이 사이트의 기준 시간대. */
export const SEOUL_OFFSET_MINUTES = 540;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 시간대를 적용한 Date. 파싱할 수 없는 값이면 null.
 *
 * null 을 돌려주는 이유: 예전에는 그대로 `toISOString()` 을 불러 RangeError 가 났는데,
 * 이 함수가 항목마다 불리므로 **깨진 값 한 건이 목록 전체를 죽였다.**
 * 발행시각은 수집 경계에서 보장되는 값이지만(ingestion-ranking INV-C5),
 * 그 약속이 깨졌을 때 화면이 통째로 사라지는 것과 한 건이 빠지는 것은 다르다.
 */
function shift(iso: string, offsetMinutes: number): Date | null {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : new Date(t + offsetMinutes * MIN_MS);
}

/**
 * ISO 시각 → 해당 시간대의 달력 날짜 키(`YYYY-MM-DD`). 묶음·비교의 기준값.
 * 파싱할 수 없으면 빈 문자열 — 부르는 쪽이 "날짜를 모르는 항목"으로 다룬다.
 */
export function dayKey(
  iso: string,
  offsetMinutes: number = SEOUL_OFFSET_MINUTES,
): string {
  return shift(iso, offsetMinutes)?.toISOString().slice(0, 10) ?? "";
}

/**
 * 두 날짜 키가 하루 차이인지. 표시 문구가 아니라 날짜로 판정한다 —
 * 이 판정을 dayHeading 의 출력 문자열("어제")로 하면 문구를 바꾸는 순간
 * 계산 분기가 조용히 달라진다.
 */
function isPreviousDay(key: string, todayKey: string): boolean {
  const day = new Date(`${key}T00:00:00.000Z`).getTime();
  const today = new Date(`${todayKey}T00:00:00.000Z`).getTime();
  if (Number.isNaN(day) || Number.isNaN(today)) return false;
  return today - day === DAY_MS;
}

/** 날짜 키 → 사람이 읽는 제목. 오늘·어제는 이름으로, 그 이전은 날짜와 요일로. */
export function dayHeading(key: string, todayKey: string): string {
  if (key === todayKey) return "오늘";
  if (isPreviousDay(key, todayKey)) return "어제";
  const day = new Date(`${key}T00:00:00.000Z`);
  // 형제 함수들과 같은 가드. 없으면 "NaN월 NaN일 (undefined)" 가 제목으로 그려진다.
  if (Number.isNaN(day.getTime())) return key;
  return `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일 (${WEEKDAY_KO[day.getUTCDay()]})`;
}

function meridiem(shifted: Date): string {
  return shifted.getUTCHours() < 12 ? "오전" : "오후";
}

/**
 * 목록 메타 줄에 쓰는 짧은 시각 표기.
 * 같은 날이면 경과 시간으로, 그 이전이면 날짜 + 오전/오후로 — 하루 단위로 훑는 화면이라
 * "37시간 전" 같은 표기는 오히려 언제인지 알기 어렵다.
 */
export function relativeTime(
  iso: string,
  nowIso: string,
  offsetMinutes: number = SEOUL_OFFSET_MINUTES,
): string {
  const shifted = shift(iso, offsetMinutes);
  const shiftedNow = shift(nowIso, offsetMinutes);
  if (shifted === null || shiftedNow === null) return "";

  const elapsedMin = Math.floor(
    (new Date(nowIso).getTime() - new Date(iso).getTime()) / MIN_MS,
  );
  const key = dayKey(iso, offsetMinutes);
  const todayKey = dayKey(nowIso, offsetMinutes);

  if (key === todayKey) {
    if (elapsedMin < 1) return "방금 전";
    if (elapsedMin < 60) return `${elapsedMin}분 전`;
    return `${Math.floor(elapsedMin / 60)}시간 전`;
  }

  if (isPreviousDay(key, todayKey)) return `어제 ${meridiem(shifted)}`;

  // 범위가 넓어질수록 단위를 하나씩 더 붙인다. 피드에서는 위에 날짜 그룹 헤더가 있어
  // "5일"만으로 충분하지만, 상세 화면에는 그 헤더가 없다 — 지난달 글이 "5일 오후"로
  // 보이면 이번 달로 읽히고, 작년 글이 "8월 5일"로 보이면 올해로 읽힌다.
  const day = `${shifted.getUTCDate()}일 ${meridiem(shifted)}`;
  const sameYear = shifted.getUTCFullYear() === shiftedNow.getUTCFullYear();
  const monthDay = `${shifted.getUTCMonth() + 1}월 ${day}`;
  if (!sameYear) return `${shifted.getUTCFullYear()}년 ${monthDay}`;
  return shifted.getUTCMonth() === shiftedNow.getUTCMonth() ? day : monthDay;
}
