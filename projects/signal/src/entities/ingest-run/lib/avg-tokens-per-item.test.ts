import { describe, expect, it } from "vitest";
import { avgTokensPerItem } from "./avg-tokens-per-item";

describe("avgTokensPerItem", () => {
  it("토큰 합계를 검색 글 수로 나눈다", () => {
    expect(avgTokensPerItem(10000, 50)).toBe(200);
  });

  it("실패경로: 검색 글이 0건이면 null", () => {
    expect(avgTokensPerItem(10000, 0)).toBeNull();
  });
});
