import { describe, expect, it } from "vitest";
import { totals } from "./totals";

function stat(over: Partial<Parameters<typeof totals>[0][number]> = {}) {
  return {
    sourceId: "s",
    fetched: 0,
    stored: 0,
    dropped: 0,
    error: null,
    filtered: 0,
    filteredTitles: [],
    extractionFailed: 0,
    tokensUsed: 0,
    ...over,
  };
}

describe("totals", () => {
  it("소스별 칸을 실행 전체 합계로 더한다", () => {
    const result = totals([
      stat({ fetched: 3, stored: 2, filtered: 1, extractionFailed: 0 }),
      stat({ fetched: 1, stored: 1, filtered: 0, extractionFailed: 1 }),
    ]);
    expect(result).toEqual({ fetched: 4, stored: 3, filtered: 1, extractionFailed: 1 });
  });

  it("소스가 없으면 전부 0이다", () => {
    expect(totals([])).toEqual({ fetched: 0, stored: 0, filtered: 0, extractionFailed: 0 });
  });
});
