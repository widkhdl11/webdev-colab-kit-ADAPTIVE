import { describe, expect, it } from "vitest";
import { MAX_BOX_COUNT } from "./register-input";
import { summarizeBoxes } from "./box-summary";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";

// 첫 공개 요금표(시험용 고정값). 운영 값은 DB 요금표에서만 온다. 화면은 원가·검수비를 받지 않는다.
const PRICES: PublicPriceTable = {
  small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 },
  medium: { priceKrw: 8900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 },
  large: { priceKrw: 10900, revgiftPriceKrw: 8400, returnShippingKrw: 6500 },
};

describe("summarizeBoxes — 등록 화면의 상자 수량·금액 안내", () => {
  it("상자 수 × 구간 요금 줄과 합계", () => {
    const s = summarizeBoxes(PRICES, { small: "2", medium: "1", large: "0" });
    expect(s.lines.map((l) => [l.tier, l.count, l.subtotalKrw])).toEqual([
      ["small", 2, 13800],
      ["medium", 1, 8900],
    ]);
    expect(s.totalKrw).toBe(22700);
  });

  it("대형도 같은 모양의 줄로 더해진다", () => {
    const s = summarizeBoxes(PRICES, { small: "0", medium: "1", large: "2" });
    expect(s.lines.map((l) => [l.tier, l.count, l.subtotalKrw])).toEqual([
      ["medium", 1, 8900],
      ["large", 2, 21800],
    ]);
    expect(s.totalKrw).toBe(30700);
    expect(s.canRemove).toEqual({ small: false, medium: true, large: true });
  });

  it("0개면 합계가 없다", () => {
    expect(summarizeBoxes(PRICES, { small: "0", medium: "0", large: "0" })).toMatchObject({ lines: [], totalKrw: null });
  });

  it(`합쳐 ${MAX_BOX_COUNT}개를 넘으면 금액을 보여 주지 않는다 — 넘은 금액을 정상 금액처럼 보이지 않게`, () => {
    expect(summarizeBoxes(PRICES, { small: "10", medium: "1", large: "0" })).toMatchObject({ lines: [], totalKrw: null, overLimit: true });
  });

  it("아주 큰 숫자를 쳐도 배열을 만들지 않고 바로 상한 초과로 끝난다 (탭이 멈추지 않는다)", () => {
    const started = Date.now();
    expect(summarizeBoxes(PRICES, { small: "5000000000", medium: "100000000", large: "0" })).toMatchObject({ totalKrw: null, overLimit: true });
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("숫자가 아닌 칸은 0으로 본다 (형식 오류는 제출 때 따로 알린다)", () => {
    expect(summarizeBoxes(PRICES, { small: "abc", medium: "1", large: "0" }).totalKrw).toBe(8900);
  });

  it("더하기는 합이 상한에 닿으면, 빼기는 그 구간이 0이면 막힌다", () => {
    const full = summarizeBoxes(PRICES, { small: String(MAX_BOX_COUNT - 1), medium: "1", large: "0" });
    expect(full.canAdd).toBe(false);
    expect(full.canRemove).toEqual({ small: true, medium: true, large: false });
    const empty = summarizeBoxes(PRICES, { small: "0", medium: "1", large: "0" });
    expect(empty.canAdd).toBe(true);
    expect(empty.canRemove).toEqual({ small: false, medium: true, large: false });
  });
});
