import { describe, expect, it } from "vitest";
import { approvalTimeLeftLabel, isApprovalDeadlinePassed } from "./approval-time-left";

const at = (hoursAfter: number) => new Date(Date.parse("2026-10-01T05:00:00.000Z") + hoursAfter * 3_600_000).toISOString();
const registered = at(0);

describe("승인 요청 남은 기간 (자동 반려는 등록부터 168시간, office-workflow INV-W6)", () => {
  it("방금 온 요청은 7일", () => {
    expect(approvalTimeLeftLabel(registered, at(0))).toBe("남은 기간 7일");
  });

  it("일은 내림 — 6일 23시간 남으면 6일", () => {
    expect(approvalTimeLeftLabel(registered, at(1))).toBe("남은 기간 6일");
    expect(approvalTimeLeftLabel(registered, at(144))).toBe("남은 기간 1일");
  });

  it("하루 안이면 시간, 올림이라 0시간은 없다", () => {
    expect(approvalTimeLeftLabel(registered, at(144.5))).toBe("남은 기간 24시간");
    expect(approvalTimeLeftLabel(registered, at(167.99))).toBe("남은 기간 1시간");
  });

  it("168시간이 되면 기한 지남 — 승인 함수와 같은 경계(168시간이면 승인 거부)", () => {
    expect(approvalTimeLeftLabel(registered, at(168))).toBe("승인 기한 지남");
    expect(approvalTimeLeftLabel(registered, at(200))).toBe("승인 기한 지남");
    expect(isApprovalDeadlinePassed(registered, at(167.99))).toBe(false);
    expect(isApprovalDeadlinePassed(registered, at(168))).toBe(true);
  });
});
