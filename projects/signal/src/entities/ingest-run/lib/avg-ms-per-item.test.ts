import { describe, expect, it } from "vitest";
import { avgMsPerItem } from "./avg-ms-per-item";

describe("avgMsPerItem", () => {
  it("소요시간을 검색 글 수로 나눈다", () => {
    expect(avgMsPerItem(243_000, 100)).toBe(2430);
  });

  it("실패경로: 검색 글이 0건이면 null (나눌 수 없음)", () => {
    expect(avgMsPerItem(243_000, 0)).toBeNull();
  });

  it("음수 건수도 잴 수 없음으로 취급한다 (0 아래는 있을 수 없는 값)", () => {
    expect(avgMsPerItem(1000, -1)).toBeNull();
  });
});
