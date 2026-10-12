import { describe, expect, it } from "vitest";
import { PARCEL_TIERS } from "@/entities/parcel/model/office-parcel";
import { initialMeasuredTier, MEASURED_TIERS } from "./measurement";

// 검수 화면의 실측 구간 처음 값 (office-workflow INV-W4 S4h — 2026-10-12 문제집 D5).
// 팬이 신고한 구간을 미리 골라 둔다. 직원은 재어 보고 다를 때만 바꾼다. 기록은 「실측 기록」을 눌러야 남는다(저장 규칙 그대로).

describe("실측 구간 처음 값 (INV-W4 S4h)", () => {
  it("INV-W4 (S4h): 신고한 구간이 미리 골라진다 — 구간마다", () => {
    expect(initialMeasuredTier("small")).toBe("small");
    expect(initialMeasuredTier("medium")).toBe("medium");
    expect(initialMeasuredTier("large")).toBe("large");
  });

  it("INV-W4 (S4h): 어느 신고 구간이든 실측 선택지 안의 값이다 — 빈 선택으로 열리지 않는다", () => {
    for (const t of PARCEL_TIERS) expect(MEASURED_TIERS).toContain(initialMeasuredTier(t));
  });
});
