import { describe, expect, it } from "vitest";
import { classifyParcel, OVERSIZE_RULE, PARCEL_TIER_GUIDE } from "./size-tier";

describe("classifyParcel — 상자 크기·무게 → 구간 (사용자 결정 d7)", () => {
  it("세 변 합 100cm·5kg 이하는 소형 — 경계값 포함", () => {
    expect(classifyParcel({ sumOfSidesCm: 100, weightKg: 5 })).toBe("small");
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 1 })).toBe("small");
  });

  it("크기는 소형인데 무게가 5kg 를 넘으면 중형", () => {
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 5.1 })).toBe("medium");
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 10 })).toBe("medium");
  });

  it("INV-K6: 100cm 나 10kg 를 넘고 160cm·20kg 이하면 대형 — 크기와 무게 중 큰 쪽", () => {
    expect(classifyParcel({ sumOfSidesCm: 101, weightKg: 1 })).toBe("large");
    expect(classifyParcel({ sumOfSidesCm: 60, weightKg: 10.1 })).toBe("large");
    expect(classifyParcel({ sumOfSidesCm: 150, weightKg: 18 })).toBe("large");
    expect(classifyParcel({ sumOfSidesCm: 160, weightKg: 20 })).toBe("large");
  });

  it("INV-K6 (S6b, 실패경로): 160cm 나 20kg 를 넘으면 받지 않는다", () => {
    expect(classifyParcel({ sumOfSidesCm: 170, weightKg: 5 })).toBe("oversize");
    expect(classifyParcel({ sumOfSidesCm: 90, weightKg: 21 })).toBe("oversize");
    expect(classifyParcel({ sumOfSidesCm: 160.5, weightKg: 1 })).toBe("oversize");
  });

  it("0 이하·숫자가 아닌 실측은 판정하지 않는다", () => {
    expect(() => classifyParcel({ sumOfSidesCm: 0, weightKg: 1 })).toThrow();
    expect(() => classifyParcel({ sumOfSidesCm: 50, weightKg: Number.NaN })).toThrow();
  });
});

describe("PARCEL_TIER_GUIDE — 화면 안내 문구가 판정 기준과 같다", () => {
  it("INV-K6: 소형·중형·대형·초과 문구", () => {
    expect(PARCEL_TIER_GUIDE.small.rule).toBe("세 변의 합 100cm 이하·무게 5kg 이하");
    expect(PARCEL_TIER_GUIDE.medium.rule).toBe("세 변의 합 100cm 이하·무게 10kg 이하");
    expect(PARCEL_TIER_GUIDE.large.rule).toBe("세 변의 합 160cm 이하·무게 20kg 이하");
    expect(OVERSIZE_RULE).toBe("세 변의 합이 160cm를 넘거나 무게가 20kg을 넘는 상자");
  });
});
