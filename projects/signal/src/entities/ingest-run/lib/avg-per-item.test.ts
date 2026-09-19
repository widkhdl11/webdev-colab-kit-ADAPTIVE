import { describe, expect, it } from "vitest";
import { avgPerItem } from "./avg-per-item";

describe("avgPerItem", () => {
  it("총합을 건수로 나눈다", () => {
    expect(avgPerItem(24300, 100)).toBe(243);
  });

  it("실패경로: 건수가 0이면 null (나눌 수 없음)", () => {
    expect(avgPerItem(1000, 0)).toBeNull();
  });

  it("음수 건수도 잴 수 없음으로 취급한다", () => {
    expect(avgPerItem(1000, -1)).toBeNull();
  });
});
