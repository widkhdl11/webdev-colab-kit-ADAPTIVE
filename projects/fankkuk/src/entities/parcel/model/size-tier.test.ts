import { describe, expect, it } from "vitest";
import { classifyParcel, isLargerTier } from "./size-tier";

describe("classifyParcel — 상자 크기·무게 → 구간 (사용자 결정 d7)", () => {
  it("세 변 합 100cm·5kg 이하는 소형 — 경계값 포함", () => {
    expect(classifyParcel({ sumOfSidesCm: 100, weightKg: 5 })).toBe("small");
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 1 })).toBe("small");
  });

  it("크기는 소형인데 무게가 5kg 를 넘으면 중형", () => {
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 5.1 })).toBe("medium");
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 10 })).toBe("medium");
  });

  it("100cm 나 10kg 를 넘으면 중형을 넘는다", () => {
    expect(classifyParcel({ sumOfSidesCm: 101, weightKg: 1 })).toBe("oversize");
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 10.1 })).toBe("oversize");
  });

  it("0 이하·숫자가 아닌 실측은 판정하지 않는다", () => {
    expect(() => classifyParcel({ sumOfSidesCm: 0, weightKg: 1 })).toThrow();
    expect(() => classifyParcel({ sumOfSidesCm: 50, weightKg: Number.NaN })).toThrow();
  });
});

describe("isLargerTier — 도착 실측이 신고보다 큰가 (차액 요청의 조건)", () => {
  it("실측이 큰 구간일 때만 참", () => {
    expect(isLargerTier("medium", "small")).toBe(true);
    expect(isLargerTier("oversize", "medium")).toBe(true);
    expect(isLargerTier("small", "small")).toBe(false);
    expect(isLargerTier("small", "medium")).toBe(false);
  });
});
