import { describe, expect, it } from "vitest";
import { revgiftPriceOf, serviceFeeOf } from "@/entities/payment/model/charge";
import { parseWon, ruleOfProblem } from "./price-input";

describe("요금표 입력 칸", () => {
  it("쉼표·「원」·공백을 빼고 읽는다", () => {
    expect(parseWon("10,900")).toBe(10900);
    expect(parseWon(" 6900 원")).toBe(6900);
    expect(parseWon("0")).toBe(0);
  });

  it("실패경로: 빈칸·음수·소수·글자는 NaN — 저장 전 검사(INV-K4 a)에서 걸린다", () => {
    for (const t of ["", "-100", "10.5", "만원"]) expect(parseWon(t)).toBeNaN();
  });

  it("INV-K4·INV-R3: 자동 칸 — 대형 10,900·6,500·2,500 이면 서비스료 1,900, 역조공 8,400", () => {
    const large = { priceKrw: 10900, carrierCostKrw: 6500, inspectionFeeKrw: 2500 };
    expect(serviceFeeOf(large)).toBe(1900);
    expect(revgiftPriceOf(large)).toBe(8400);
    // 입력 중 빈칸(NaN)은 오류 없이 NaN 으로 — 화면이 「—」로 그린다
    expect(serviceFeeOf({ ...large, carrierCostKrw: Number.NaN })).toBeNaN();
  });

  it("검사 결과 → 목록 줄", () => {
    expect(ruleOfProblem("not_integer")).toBe("a");
    expect(ruleOfProblem("price_zero")).toBe("a");
    expect(ruleOfProblem("shape")).toBe("a");
    expect(ruleOfProblem("costs_exceed_price")).toBe("b");
    expect(ruleOfProblem("not_ascending")).toBe("c");
  });
});
