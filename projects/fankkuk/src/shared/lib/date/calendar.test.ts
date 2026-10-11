import { describe, expect, it } from "vitest";
import { isLeapYear, splitIsoDate } from "./calendar";

describe("달력 조각", () => {
  it("윤년 — 4로 나뉘고, 100으로 나뉘면 400으로도 나뉘어야 한다", () => {
    expect([2024, 2000, 2400].map(isLeapYear)).toEqual([true, true, true]);
    expect([2025, 1900, 2100].map(isLeapYear)).toEqual([false, false, false]);
  });

  it("YYYY-MM-DD 만 나눈다 — 다른 꼴은 null", () => {
    expect(splitIsoDate("2026-02-09")).toEqual({ year: 2026, month: 2, day: 9 });
    expect(splitIsoDate("2026-02-30")).toEqual({ year: 2026, month: 2, day: 30 });
    for (const bad of ["2026-2-09", "2026-02-09T00:00", " 2026-02-09", "20260209"]) expect(splitIsoDate(bad), bad).toBeNull();
  });
});
