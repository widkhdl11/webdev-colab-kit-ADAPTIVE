import { describe, expect, it } from "vitest";
import { buildMetricsView, NOT_YET, periodLabel, rateText, type MetricRow } from "./metrics-view";

// 운영자 「측정」 화면이 집계 줄을 표로 바꾸는 계산 (docs/specs/metrics.md INV-Q2·Q3·Q5).
// 비율과 분자·분모만 다룬다. 분모가 0 이면 비율 대신 「아직 셀 수 없어요」.

const row = (metric: string, period: string, numerator: number, denominator: number, bucket = ""): MetricRow => ({
  metric,
  period,
  bucket,
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

describe("비율 글자", () => {
  it("INV-Q2: 분자·분모로 백분율 — 소수 첫째 자리까지, 끝의 0 은 뺀다", () => {
    expect(rateText({ numerator: 1, denominator: 2 })).toBe("50%");
    expect(rateText({ numerator: 1, denominator: 3 })).toBe("33.3%");
    expect(rateText({ numerator: 2, denominator: 3 })).toBe("66.7%");
    expect(rateText({ numerator: 0, denominator: 5 })).toBe("0%");
  });

  it("INV-Q3 (실패경로): 분모가 0 이면 0% 가 아니라 아직 셀 수 없다고 쓴다", () => {
    expect(rateText({ numerator: 0, denominator: 0 })).toBe(NOT_YET);
  });

  it("기간 이름 — 전체와 한국 시간 달", () => {
    expect(periodLabel("all")).toBe("전체");
    expect(periodLabel("2026-10")).toBe("2026년 10월");
    expect(periodLabel("2026-01")).toBe("2026년 1월");
  });
});

describe("표로 바꾸기", () => {
  const rows: MetricRow[] = [
    row("resend", "all", 1, 2),
    row("resend", "2026-10", 0, 0),
    row("resend", "2026-09", 1, 1),
    row("resend", "2026-08", 0, 1),
    row("decline", "all", 2, 3),
    row("signup_source", "all", 2, 3, "creator_stream"),
    row("signup_source", "all", 1, 3, "none"),
    row("utm_source", "all", 1, 3, "x_share"),
    row("unknown_metric", "all", 9, 9),
  ];
  const view = buildMetricsView(rows);

  it("기간은 전체 다음 최근 달 순서", () => {
    expect(view.periods.map((p) => p.label)).toEqual(["전체", "2026년 10월", "2026년 9월", "2026년 8월"]);
  });

  it("INV-Q3·Q5: 비율 지표는 정해진 순서로 모두 나온다 — 줄이 없는 칸은 아직 셀 수 없다", () => {
    expect(view.ratios.map((r) => r.metric)).toEqual(["resend", "resend_replied", "resend_not_replied", "reply", "notice_changed", "decline"]);
    const resend = view.ratios[0]!;
    expect(resend.cells.map((c) => [c.rate, c.count])).toEqual([
      ["50%", "1 / 2"],
      [NOT_YET, "0 / 0"],
      ["100%", "1 / 1"],
      ["0%", "0 / 1"],
    ]);
    const replied = view.ratios[1]!;
    expect(replied.cells.every((c) => c.rate === NOT_YET && c.count === "0 / 0")).toBe(true);
  });

  it("INV-Q4: 가입 경로는 다섯 답 + 고르지 않음, 정해진 순서", () => {
    expect(view.sources.map((s) => s.label)).toEqual(["X", "크리에이터 방송", "팬 커뮤니티", "지인", "기타", "고르지 않음"]);
    const stream = view.sources[1]!;
    expect(stream.cells[0]).toEqual({ period: "all", rate: "66.7%", count: "2 / 3" });
  });

  it("INV-Q4: utm 은 전체 기간의 값별 건수", () => {
    expect(view.utm.find((u) => u.kind === "utm_source")?.items).toEqual([{ value: "x_share", rate: "33.3%", count: "1 / 3" }]);
    expect(view.utm.find((u) => u.kind === "utm_medium")?.items).toEqual([]);
  });

  it("모르는 지표 줄은 버린다", () => {
    expect(JSON.stringify(view)).not.toContain("unknown_metric");
  });
});
