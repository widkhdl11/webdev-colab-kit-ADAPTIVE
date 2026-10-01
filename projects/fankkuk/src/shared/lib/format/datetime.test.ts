import { describe, expect, it } from "vitest";
import { formatDuration } from "./datetime";

describe("formatDuration", () => {
  it("단위 경계에서 반올림한 뒤 단위를 고른다 — 「약 60분」「약 24시간」이 나오지 않는다", () => {
    expect(formatDuration(59.6)).toBe("약 1시간");
    expect(formatDuration(23.6 * 60)).toBe("약 1일");
    expect(formatDuration(40)).toBe("약 40분");
    expect(formatDuration(150)).toBe("약 3시간");
    expect(formatDuration(0)).toBe("약 1분");
  });
});
