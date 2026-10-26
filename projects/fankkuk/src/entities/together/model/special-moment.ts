// 특별 카드 (together INV-F4) — 화면 쪽 계산은 이 함수 하나다.
// 10번째·30번째 선물과, 처음 선물한 날로부터 1년이 되는 날 이후 처음 보낸 선물. 본인 화면에서만 쓴다 —
// 공유 카드·공개 화면에는 순번이 들어가지 않는다(공유 카드 재료는 순번을 받지 않는다).
// 연속 기록(끊기면 사라지는 것)은 없다. 한 카드에 문구는 하나 — 1년째와 10·30번째가 겹치면 1년째로 보인다(DECISIONS 2026-10-12).

import { splitIsoDate } from "@/shared/lib/date/calendar";

export type SpecialMoment = "tenth" | "thirtieth" | "first_year";

export const SPECIAL_MOMENT_TEXT: Record<SpecialMoment, string> = {
  tenth: "10번째 선물",
  thirtieth: "30번째 선물",
  first_year: "첫 선물 1주년",
};

const BY_NUMBER: ReadonlyMap<number, SpecialMoment> = new Map([
  [10, "tenth"],
  [30, "thirtieth"],
]);

/**
 * YYYY-MM-DD 의 1년 뒤 — 2월 29일은 다음 해 2월 28일. 2월 29일은 윤년에만 있고 그다음 해는 윤년일 수 없어
 * 윤년인지 따로 볼 것이 없다.
 */
export function oneYearAfter(isoDate: string): string {
  const d = splitIsoDate(isoDate);
  if (!d) throw new Error(`날짜 형식이 아니다: ${isoDate}`);
  const day = d.month === 2 && d.day === 29 ? 28 : d.day;
  return `${d.year + 1}-${String(d.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 순번(giftNo, 1부터 — 결제한 순서)과 등록 날짜(한국 시간 YYYY-MM-DD)로 특별한 카드를 고른다.
 * firstGiftOn 은 처음 선물한 날(DB 가 센 값). 돌려주는 것은 순번 → 특별 카드 종류.
 */
export function specialMoments(
  gifts: readonly { giftNo: number; registeredOn: string }[],
  firstGiftOn: string,
): Map<number, SpecialMoment> {
  const out = new Map<number, SpecialMoment>();
  for (const g of gifts) {
    const hit = BY_NUMBER.get(g.giftNo);
    if (hit) out.set(g.giftNo, hit);
  }
  const yearOn = oneYearAfter(firstGiftOn);
  // 같은 꼴(YYYY-MM-DD)이라 글자 비교가 날짜 비교다
  const firstAfterYear = gifts.filter((g) => g.registeredOn >= yearOn).sort((a, b) => a.giftNo - b.giftNo)[0];
  if (firstAfterYear) out.set(firstAfterYear.giftNo, "first_year");
  return out;
}
