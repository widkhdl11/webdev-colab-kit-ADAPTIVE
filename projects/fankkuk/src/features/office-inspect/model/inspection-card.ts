// 상자 속 검수 완료 카드 — 인쇄물에 들어가는 글 (추가분 F-8: 로고·「추적 장치 검수 완료」·검수 날짜만, 주문번호·닉네임 없음).
// 카드에 주문 정보가 없으니 상자마다 다르지 않다 — 운영자가 날짜와 장수를 골라 한 번에 인쇄한다.
import { parseIsoDate, type CalendarDate } from "@/entities/creator/model/receiving";

export type CardSize = "biz" | "post";

/** 한 번에 인쇄하는 장수 상한 — 하루 검수 물량을 넉넉히 덮는다. */
export const MAX_CARD_COUNT = 40;

/** 「검수일 2026.10.08」 */
export function inspectionDateLabel(date: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `검수일 ${date.year}.${pad(date.month)}.${pad(date.day)}`;
}

/** 입력한 날짜(YYYY-MM-DD)가 달력에 없거나 오늘보다 뒤면 오늘로 — 검수 날짜는 미래일 수 없다. */
export function cardDate(input: string, today: CalendarDate): CalendarDate {
  const d = parseIsoDate(input);
  if (!d) return today;
  const key = (c: CalendarDate) => c.year * 10000 + c.month * 100 + c.day;
  return key(d) > key(today) ? today : d;
}

/** 장수는 1 ~ MAX_CARD_COUNT 의 정수. 숫자가 아니면 1. */
export function cardCount(input: number): number {
  if (!Number.isFinite(input)) return 1;
  return Math.min(MAX_CARD_COUNT, Math.max(1, Math.trunc(input)));
}
