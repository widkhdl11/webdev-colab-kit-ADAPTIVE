import { describe, expect, it } from "vitest";
import { canRefund } from "./refund-access";

describe("INV-K2 · INV-K7: 환불 버튼은 대표에게만, 대기·실패 줄에만", () => {
  it("대표는 대기·실패 줄에서 누를 수 있다", () => {
    expect(canRefund("owner", "due")).toBe(true);
    expect(canRefund("owner", "failed")).toBe(true);
  });

  it("(실패경로) 대표라도 처리 중·완료·대상 아님 줄에는 버튼이 없다", () => {
    for (const s of ["requesting", "done", "none"] as const) expect(canRefund("owner", s)).toBe(false);
  });

  it("INV-K2 (실패경로): 직원에게는 어느 줄에도 버튼이 없다", () => {
    for (const s of ["due", "failed", "requesting", "done", "none"] as const) expect(canRefund("staff", s)).toBe(false);
  });
});
