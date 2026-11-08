import { describe, expect, it } from "vitest";
import { boxServiceFeesFromRow, boxServiceFeesProblem } from "./box-service-fees";

// 선물함 서비스료 설정값 (revgift-box INV-GB13~GB15) — DB 읽기 꼴 → 화면 꼴, 입력 검사(DB 검사와 같은 범위).

describe("선물함 서비스료 읽기", () => {
  it("DB 가 준 정가·초기 크리에이터 값을 화면 꼴로", () => {
    expect(boxServiceFeesFromRow({ regular_krw: 700, early_krw: 300 })).toEqual({ regularKrw: 700, earlyKrw: 300 });
  });

  it.each([[null], [{}], [{ regular_krw: "700", early_krw: 300 }], [{ regular_krw: 700, early_krw: 1.5 }]])("실패경로: 꼴이 다르면 null (%j)", (raw) => {
    expect(boxServiceFeesFromRow(raw)).toBeNull();
  });
});

describe("선물함 서비스료 입력 검사 (0 ≤ 초기 크리에이터 ≤ 정가 ≤ 100,000원)", () => {
  it("경계 안이면 문제 없음", () => {
    expect(boxServiceFeesProblem({ regularKrw: 700, earlyKrw: 300 })).toBeNull();
    expect(boxServiceFeesProblem({ regularKrw: 0, earlyKrw: 0 })).toBeNull();
    expect(boxServiceFeesProblem({ regularKrw: 100_000, earlyKrw: 100_000 })).toBeNull();
  });

  it.each([
    ["정가가 100,000원 초과", { regularKrw: 100_001, earlyKrw: 300 }, "out_of_range"],
    ["음수", { regularKrw: 700, earlyKrw: -1 }, "out_of_range"],
    ["소수", { regularKrw: 700.5, earlyKrw: 300 }, "out_of_range"],
    ["숫자 아님", { regularKrw: Number.NaN, earlyKrw: 300 }, "out_of_range"],
    ["초기 크리에이터가 정가보다 큼", { regularKrw: 700, earlyKrw: 701 }, "early_above_regular"],
  ] as const)("실패경로: %s", (_label, fees, problem) => {
    expect(boxServiceFeesProblem(fees)).toBe(problem);
  });
});
