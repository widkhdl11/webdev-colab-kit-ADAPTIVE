import { describe, expect, it } from "vitest";
import { formatDuration, formatMonthDay, formatStamp, seoulDaysUntil } from "./datetime";

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

describe("seoulDaysUntil — 서울 날짜로 센 남은 날", () => {
  it("서울 10월 16일 낮에 보면 10월 18일 오후 11시 59분 기한은 2일", () => {
    expect(seoulDaysUntil("2026-10-18T14:59:00+00:00", "2026-10-16T03:00:00+00:00")).toBe(2);
  });
  it("UTC 로는 같은 날이어도 서울 날짜가 다르면 하루 — 서울 자정을 넘기는 경계", () => {
    expect(seoulDaysUntil("2026-10-17T15:30:00+00:00", "2026-10-17T14:30:00+00:00")).toBe(1);
    expect(seoulDaysUntil("2026-10-17T14:50:00+00:00", "2026-10-17T00:10:00+00:00")).toBe(0);
  });
});
