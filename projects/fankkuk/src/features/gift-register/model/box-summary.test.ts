import { describe, expect, it } from "vitest";
import { MAX_BOX_COUNT } from "./register-input";
import { summarizeBoxes } from "./box-summary";

describe("summarizeBoxes — 등록 화면의 상자 수량·금액 안내", () => {
  it("상자 수 × 구간 요금 줄과 합계", () => {
    const s = summarizeBoxes({ small: "2", medium: "1" });
    expect(s.lines.map((l) => [l.tier, l.count, l.subtotalKrw])).toEqual([
      ["small", 2, 13800],
      ["medium", 1, 8900],
    ]);
    expect(s.totalKrw).toBe(22700);
  });

  it("0개면 합계가 없다", () => {
    expect(summarizeBoxes({ small: "0", medium: "0" })).toMatchObject({ lines: [], totalKrw: null });
  });

  it(`합쳐 ${MAX_BOX_COUNT}개를 넘으면 금액을 보여 주지 않는다 — 넘은 금액을 정상 금액처럼 보이지 않게`, () => {
    expect(summarizeBoxes({ small: "10", medium: "1" })).toMatchObject({ lines: [], totalKrw: null, overLimit: true });
  });

  it("아주 큰 숫자를 쳐도 배열을 만들지 않고 바로 상한 초과로 끝난다 (탭이 멈추지 않는다)", () => {
    const started = Date.now();
    expect(summarizeBoxes({ small: "5000000000", medium: "100000000" })).toMatchObject({ totalKrw: null, overLimit: true });
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("숫자가 아닌 칸은 0으로 본다 (형식 오류는 제출 때 따로 알린다)", () => {
    expect(summarizeBoxes({ small: "abc", medium: "1" }).totalKrw).toBe(8900);
  });

  it("더하기는 합이 상한에 닿으면, 빼기는 그 구간이 0이면 막힌다", () => {
    const full = summarizeBoxes({ small: String(MAX_BOX_COUNT - 1), medium: "1" });
    expect(full.canAdd).toBe(false);
    expect(full.canRemove).toEqual({ small: true, medium: true });
    const empty = summarizeBoxes({ small: "0", medium: "1" });
    expect(empty.canAdd).toBe(true);
    expect(empty.canRemove).toEqual({ small: false, medium: true });
  });
});
