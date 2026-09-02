/* 한국 시간(KST, UTC+9) 고정 날짜 계산.
 *
 * 시간대를 실행 환경에 맡기지 않는 이유: 이 화면은 날짜가 1차 묶음이다. 서버가 UTC 로,
 * 브라우저가 KST 로 계산하면 같은 글이 서버 렌더에서는 "어제", 하이드레이션 뒤에는 "오늘"
 * 그룹에 들어가 화면이 한 번 뒤바뀐다. KST 는 서머타임이 없어 고정 오프셋으로 충분하다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
};

/** ISO 문자열을 KST 벽시계 값으로 쪼갠다. 해석할 수 없으면 null. */
function partsOf(iso: string): KstParts | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  // UTC 필드를 읽으면 그 값이 곧 KST 벽시계가 되도록 미리 밀어 둔다.
  const shifted = new Date(ms + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 그룹 키. `2026-08-31` 꼴이고 문자열 정렬이 곧 날짜 정렬이다.
 *
 * 해석할 수 없는 값에 null 을 돌려주는 것은 의도다 — 예전에 잘못된 날짜 한 건이
 * 페이지 전체를 500 으로 만든 적이 있다. 부르는 쪽이 그 한 건만 빼도록 한다.
 */
export function kstDayKey(iso: string): string | null {
  const p = partsOf(iso);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : null;
}

/**
 * 그 순간이 속한 KST 날짜의 자정을 UTC 기준 밀리초로 돌려준다.
 * 하루를 더하고 빼는 계산은 전부 여기서 출발해야 월말·연말이 저절로 넘어간다.
 */
export function kstDayStartMs(iso: string): number | null {
  const p = partsOf(iso);
  if (!p) return null;
  return Date.UTC(p.year, p.month - 1, p.day) - KST_OFFSET_MS;
}

/** 어제의 그룹 키. 기준 시각을 해석할 수 없으면 null. */
function yesterdayKeyOf(nowIso: string): string | null {
  const start = kstDayStartMs(nowIso);
  if (start === null) return null;
  return kstDayKey(new Date(start - 86_400_000).toISOString());
}

/** 날짜 그룹 제목. 오늘·어제는 이름으로, 그 앞은 `8월 29일 (토)`. */
export function dayGroupLabel(dayKey: string, nowIso: string): string {
  if (dayKey === kstDayKey(nowIso)) return "오늘";
  if (dayKey === yesterdayKeyOf(nowIso)) return "어제";

  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;

  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

/**
 * 메타 줄의 시각 표기. 오늘 안이면 경과 시간, 그 앞이면 날짜 + 오전/오후.
 * 소속 날짜 그룹과 어긋나지 않게 같은 KST 기준으로 판정한다.
 */
export function relativeTime(iso: string, nowIso: string): string {
  const at = partsOf(iso);
  const now = partsOf(nowIso);
  if (!at || !now) return "";

  const atKey = kstDayKey(iso);
  const nowKey = kstDayKey(nowIso);
  const half = at.hour < 12 ? "오전" : "오후";

  if (atKey === nowKey) {
    const minutes = Math.floor((Date.parse(nowIso) - Date.parse(iso)) / 60_000);
    if (minutes < 1) return "방금";
    if (minutes < 60) return `${minutes}분 전`;
    return `${Math.floor(minutes / 60)}시간 전`;
  }

  if (atKey === yesterdayKeyOf(nowIso)) return `어제 ${half}`;

  return `${at.day}일 ${half}`;
}

/** `<time datetime=…>` 에 넣을 값. 스크린리더와 기계가 읽는 쪽이다. */
export function machineDate(iso: string): string {
  return kstDayKey(iso) ?? "";
}
