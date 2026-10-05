import { describe, expect, it } from "vitest";
import { canReprintCreatorLabel } from "./label-print-access";

describe("송장 다시 출력 버튼 (INV-P8·W3)", () => {
  it("대표 + 팬 선물 상자일 때만 보인다", () => {
    expect(canReprintCreatorLabel("owner", "gift")).toBe(true);
  });
  it("INV-P8 (실패경로): 직원에게는 보이지 않는다", () => {
    expect(canReprintCreatorLabel("staff", "gift")).toBe(false);
  });
  it("역조공 상자는 크리에이터 주소를 열지 않으므로 보이지 않는다", () => {
    expect(canReprintCreatorLabel("owner", "revgift")).toBe(false);
  });
});
