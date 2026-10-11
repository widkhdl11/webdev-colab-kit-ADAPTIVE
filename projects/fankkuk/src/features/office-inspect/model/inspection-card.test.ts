import { describe, expect, it } from "vitest";
import { cardCount, cardDate, inspectionDateLabel, MAX_CARD_COUNT } from "./inspection-card";

const today = { year: 2026, month: 10, day: 11 };

describe("검수 완료 카드 글", () => {
  it("날짜는 「검수일 YYYY.MM.DD」 — 한 자리 달·날은 0을 붙인다", () => {
    expect(inspectionDateLabel({ year: 2026, month: 3, day: 8 })).toBe("검수일 2026.03.08");
  });

  it("고른 날짜를 쓰고, 달력에 없는 날·형식이 틀린 값·미래 날짜는 오늘로", () => {
    expect(cardDate("2026-10-08", today)).toEqual({ year: 2026, month: 10, day: 8 });
    expect(cardDate("2026-02-30", today)).toEqual(today);
    expect(cardDate("20261008", today)).toEqual(today);
    expect(cardDate("2026-10-12", today)).toEqual(today);
    expect(cardDate("2026-10-11", today)).toEqual(today);
  });

  it("장수는 1 ~ 상한의 정수", () => {
    expect(cardCount(0)).toBe(1);
    expect(cardCount(-3)).toBe(1);
    expect(cardCount(Number.NaN)).toBe(1);
    expect(cardCount(7.9)).toBe(7);
    expect(cardCount(MAX_CARD_COUNT + 1)).toBe(MAX_CARD_COUNT);
  });
});
