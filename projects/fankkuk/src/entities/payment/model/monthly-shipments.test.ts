import { describe, expect, it } from "vitest";
import { formatMonthKo, monthlyShipmentsFromRow, routeReview, type MonthlyShipments } from "./monthly-shipments";

function shipments(counts: Record<string, number>, over: Partial<MonthlyShipments> = {}): MonthlyShipments {
  const months = Object.entries(counts).map(([month, count]) => ({ month, count }));
  return { currentMonth: months[months.length - 1]!.month, months, firstMonth: "2026-06", minMonthly: 30, monthsNeeded: 2, ...over };
}

describe("routeReview (admin-console INV-K17)", () => {
  it("S17: 끝난 두 달이 모두 30건 미만이면 경고, 판정한 달은 그 두 달", () => {
    const r = routeReview(shipments({ "2026-08": 40, "2026-09": 29, "2026-10": 12, "2026-11": 0 }));
    expect(r.warn).toBe(true);
    expect(r.judged.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
  });

  it("S17 (실패경로): 둘 중 한 달이라도 30건이면 경고 없음 — 기준은 「미만」", () => {
    expect(routeReview(shipments({ "2026-09": 30, "2026-10": 12, "2026-11": 0 })).warn).toBe(false);
    expect(routeReview(shipments({ "2026-09": 12, "2026-10": 30, "2026-11": 0 })).warn).toBe(false);
  });

  it("S17b: 이번 달은 세지 않는다 — 이번 달이 0건이어도 끝난 두 달이 넉넉하면 경고 없음", () => {
    expect(routeReview(shipments({ "2026-09": 31, "2026-10": 31, "2026-11": 0 })).warn).toBe(false);
  });

  it("S17c: 처음 발송한 달(한 달을 다 쓰지 않음)이 끼면 판정하지 않는다", () => {
    const r = routeReview(shipments({ "2026-09": 3, "2026-10": 5, "2026-11": 1 }, { firstMonth: "2026-09" }));
    expect(r).toEqual({ warn: false, judged: [] });
    expect(routeReview(shipments({ "2026-09": 3, "2026-10": 5, "2026-11": 1 }, { firstMonth: "2026-08" })).warn).toBe(true);
  });

  it("S17c: 한 번도 보내지 않았으면 경고 없음", () => {
    expect(routeReview(shipments({ "2026-09": 0, "2026-10": 0, "2026-11": 0 }, { firstMonth: null })).warn).toBe(false);
  });

  it("S17d: 기준 건수·달 수는 설정값을 따른다", () => {
    const base = { "2026-08": 10, "2026-09": 10, "2026-10": 10, "2026-11": 0 };
    expect(routeReview(shipments(base, { minMonthly: 10 })).warn).toBe(false);
    expect(routeReview(shipments(base, { minMonthly: 11, monthsNeeded: 3 })).judged).toHaveLength(3);
    expect(routeReview(shipments({ "2026-10": 1, "2026-11": 0 }, { monthsNeeded: 3 })).warn).toBe(false); // 달이 모자람
  });
});

describe("monthlyShipmentsFromRow", () => {
  const row = {
    current_month: "2026-11",
    months: [
      { month: "2026-10", count: 3 },
      { month: "2026-11", count: 1 },
    ],
    first_month: "2026-09",
    min_monthly: 30,
    months_needed: 2,
  };

  it("DB 꼴을 화면 꼴로", () => {
    expect(monthlyShipmentsFromRow(row)).toEqual({
      currentMonth: "2026-11",
      months: [
        { month: "2026-10", count: 3 },
        { month: "2026-11", count: 1 },
      ],
      firstMonth: "2026-09",
      minMonthly: 30,
      monthsNeeded: 2,
    });
  });

  it("(실패경로): 운영자가 아니면(null)·꼴이 다르면·마지막 달이 이번 달이 아니면 null", () => {
    expect(monthlyShipmentsFromRow(null)).toBeNull();
    expect(monthlyShipmentsFromRow({ ...row, min_monthly: 0 })).toBeNull();
    expect(monthlyShipmentsFromRow({ ...row, months: [{ month: "2026-10", count: -1 }] })).toBeNull();
    expect(monthlyShipmentsFromRow({ ...row, current_month: "2026-12" })).toBeNull();
  });

  it("달 이름", () => {
    expect(formatMonthKo("2026-01")).toBe("2026년 1월");
  });
});
