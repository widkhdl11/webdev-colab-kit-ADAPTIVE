import { describe, expect, it } from "vitest";
import { canReprintLabel } from "./label-print-access";

describe("송장 다시 출력 버튼 (INV-P8·W3, reverse-gift INV-R7)", () => {
  it("대표에게 보인다 — 팬 선물·역조공 상자 모두", () => {
    expect(canReprintLabel("owner")).toBe(true);
  });
  it("INV-P8 (실패경로): 직원에게는 보이지 않는다", () => {
    expect(canReprintLabel("staff")).toBe(false);
  });
});
