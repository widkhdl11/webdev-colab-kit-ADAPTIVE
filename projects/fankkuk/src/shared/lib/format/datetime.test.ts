import { describe, expect, it } from "vitest";
import { formatDuration, formatMonthDay, formatStamp } from "./datetime";

describe("formatStamp · formatMonthDay", () => {
  it("서울 시각으로 「MM-DD HH:mm」「MM-DD」 — UTC 밤 시각은 다음 날로 넘어간다", () => {
    expect(formatStamp("2026-10-02T15:05:00Z")).toBe("10-03 00:05");
    expect(formatStamp("2026-09-28T06:10:00+00:00")).toBe("09-28 15:10");
    expect(formatMonthDay("2026-10-02T15:05:00Z")).toBe("10-03");
  });
});

describe("formatDuration", () => {
  it("단위 경계에서 반올림한 뒤 단위를 고른다 — 「약 60분」「약 24시간」이 나오지 않는다", () => {
    expect(formatDuration(59.6)).toBe("약 1시간");
    expect(formatDuration(23.6 * 60)).toBe("약 1일");
    expect(formatDuration(40)).toBe("약 40분");
    expect(formatDuration(150)).toBe("약 3시간");
    expect(formatDuration(0)).toBe("약 1분");
  });
});
