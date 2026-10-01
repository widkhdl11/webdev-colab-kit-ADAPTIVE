import { describe, expect, it } from "vitest";
import { approvalTimeOf } from "./approval-time";

describe("approvalTimeOf — 화면마다 같은 평균 승인 시간(분)", () => {
  it("주문 기록으로 계산한 평균이 있으면 그 값을 쓴다", () => {
    expect(approvalTimeOf(95, 2)).toBe(95);
  });
  it("주문 기록이 없으면 소개 칸의 시간을 분으로 바꿔 쓴다", () => {
    expect(approvalTimeOf(null, 2)).toBe(120);
  });
  it("둘 다 없으면 null — 0분이라고 하지 않는다", () => {
    expect(approvalTimeOf(null, undefined)).toBeNull();
  });
});
