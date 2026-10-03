import { describe, expect, it } from "vitest";
import { assessMeasuredTier, isDifferenceOverdue } from "./difference";

describe("도착 실측 차액 (INV-M11)", () => {
  it("INV-M11 (S11): 소형 신고·중형 실측이면 차액 2,000원, 칸마다 차", () => {
    const r = assessMeasuredTier({ declared: "small", measured: "medium" });
    expect(r.kind).toBe("difference");
    if (r.kind !== "difference") return;
    expect(r.charge.totalKrw).toBe(2000);
    expect(r.charge.goodsKrw + r.charge.serviceFeeKrw + r.charge.inspectionFeeKrw + r.charge.shippingFeeKrw).toBe(2000);
    expect(r.charge.shippingFeeKrw).toBe(1000);
    expect(r.charge.inspectionFeeKrw).toBe(500);
    expect(r.charge.serviceFeeKrw).toBe(500);
  });

  it("INV-M11 (S11b, 실패경로): 실측이 신고와 같거나 작으면 차액도 환불도 없다", () => {
    expect(assessMeasuredTier({ declared: "small", measured: "small" })).toEqual({ kind: "none" });
    expect(assessMeasuredTier({ declared: "medium", measured: "small" })).toEqual({ kind: "none" });
  });

  it("INV-M11 (S11c, 실패경로): 실측이 중형을 넘으면 차액이 아니라 검수 불합격", () => {
    expect(assessMeasuredTier({ declared: "small", measured: "oversize" })).toEqual({ kind: "inspection_failed" });
    expect(assessMeasuredTier({ declared: "medium", measured: "oversize" })).toEqual({ kind: "inspection_failed" });
  });
});

describe("차액 미납 기한 (INV-M13)", () => {
  const requestedAt = "2026-10-01T03:00:00.000Z";
  const plusHours = (h: number) => new Date(Date.parse(requestedAt) + h * 3_600_000).toISOString();

  it("INV-M13 (S13): 요청 뒤 168시간이 지나면 반송 대상, 167시간이면 아직 아니다", () => {
    expect(isDifferenceOverdue({ requestedAt, now: plusHours(167) })).toBe(false);
    expect(isDifferenceOverdue({ requestedAt, now: plusHours(168) })).toBe(true);
  });

  it("INV-M13 (실패경로): 시간대 없는 시각은 서버 시간대에 따라 168시간이 달라지므로 받지 않는다", () => {
    expect(() => isDifferenceOverdue({ requestedAt: "2026-10-01T12:00:00", now: plusHours(200) })).toThrow();
    expect(isDifferenceOverdue({ requestedAt: "2026-10-01T12:00:00+09:00", now: plusHours(200) })).toBe(true);
  });

  it("INV-M13 (실패경로): 시각을 읽을 수 없으면 판정하지 않고 실패한다", () => {
    expect(() => isDifferenceOverdue({ requestedAt: "어제", now: plusHours(200) })).toThrow();
  });
});
