import { describe, expect, it } from "vitest";
import { averageApprovalMinutes } from "./approval-time";

const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h)).toISOString();

describe("averageApprovalMinutes — 등록 화면의 평균 승인 시간 (저장하지 않고 계산)", () => {
  it("승인된 주문의 등록→승인 시간 평균", () => {
    const records = [
      { registeredAt: at(0), approvedAt: at(2) },
      { registeredAt: at(0), approvedAt: at(4) },
    ];
    expect(averageApprovalMinutes(records)).toBe(180);
  });

  it("승인되지 않은 주문은 평균에 넣지 않는다", () => {
    const records = [
      { registeredAt: at(0), approvedAt: at(1) },
      { registeredAt: at(0), approvedAt: null },
    ];
    expect(averageApprovalMinutes(records)).toBe(60);
  });

  it("승인 기록이 하나도 없으면 null — 0분이라고 하지 않는다", () => {
    expect(averageApprovalMinutes([])).toBeNull();
    expect(averageApprovalMinutes([{ registeredAt: at(0), approvedAt: null }])).toBeNull();
  });
});
