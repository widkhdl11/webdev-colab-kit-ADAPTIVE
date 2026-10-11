import { describe, expect, it } from "vitest";
import { buildMetricsView, NOT_YET, periodLabel, rateText, type MetricRow } from "./metrics-view";

// 운영자 「측정」 화면이 집계 줄을 표로 바꾸는 계산 (docs/specs/metrics.md INV-Q2·Q3·Q5).
// 비율과 분자·분모만 다룬다. 비율은 DB 가 준 값(분자 ÷ 분모, 분모 0 이면 비어 있음)을 화면에서 한 번만 반올림한다.

const row = (metric: string, period: string, numerator: number, denominator: number, bucket = ""): MetricRow => ({
  metric,
  period,
  bucket,
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

describe("비율 글자", () => {
  it("INV-Q2: DB 비율을 백분율로 — 소수 첫째 자리까지, 끝의 0 은 뺀다", () => {
    expect(rateText({ rate: 0.5 })).toBe("50%");
    expect(rateText({ rate: 1 / 3 })).toBe("33.3%");
    expect(rateText({ rate: 2 / 3 })).toBe("66.7%");
    expect(rateText({ rate: 0 })).toBe("0%");
    expect(rateText({ rate: 0.12345 })).toBe("12.3%");
  });

  it("INV-Q3 (실패경로): 비율이 비어 있으면(분모 0) 0% 가 아니라 아직 셀 수 없다고 쓴다", () => {
    expect(rateText({ rate: null })).toBe(NOT_YET);
  });

  it("기간 이름 — 전체와 한국 시간 달", () => {
    expect(periodLabel("all")).toBe("전체");
    expect(periodLabel("2026-10")).toBe("2026년 10월");
    expect(periodLabel("2026-01")).toBe("2026년 1월");
  });
});

describe("표로 바꾸기", () => {
  // 재발송률 세 줄은 60일이 다 지난 첫 선물 달(7·6·5월), 나머지는 최근 3개월(10·9·8월) — DB 가 그렇게 준다
  const rows: MetricRow[] = [
    row("resend", "all", 1, 2),
    row("resend", "2026-07", 1, 1),
    row("resend", "2026-06", 0, 1),
    row("resend", "2026-05", 0, 0),
    row("resend_replied", "all", 0, 0),
    row("decline", "all", 2, 3),
    row("decline", "2026-10", 1, 1),
    row("decline", "2026-09", 0, 0),
    row("decline", "2026-08", 1, 2),
    row("signup_source", "all", 2, 3, "creator_stream"),
    row("signup_source", "all", 1, 3, "none"),
    row("signup_source", "2026-10", 1, 1, "none"),
    row("utm_source", "all", 1, 3, "x_share"),
    row("unknown_metric", "2026-01", 9, 9),
  ];
  const view = buildMetricsView(rows);

  it("INV-Q3: 재발송률 표의 기간은 전체 다음 60일이 다 지난 첫 선물 달 — 최근 3개월이 아니다", () => {
    expect(view.cohort.periods.map((p) => p.label)).toEqual(["전체", "2026년 7월", "2026년 6월", "2026년 5월"]);
    expect(view.cohort.ratios.map((r) => r.metric)).toEqual(["resend", "resend_replied", "resend_not_replied"]);
    expect(view.cohort.ratios[0]!.cells.map((c) => [c.rate, c.count])).toEqual([
      ["50%", "1 / 2"],
      ["100%", "1 / 1"],
      ["0%", "0 / 1"],
      [NOT_YET, "0 / 0"],
    ]);
    expect(view.cohort.ratios[1]!.cells.every((c) => c.rate === NOT_YET && c.count === "0 / 0")).toBe(true);
  });

  it("INV-Q5: 나머지 지표 표의 기간은 전체 다음 최근 3개월 — 재발송률 달이 섞이지 않는다", () => {
    expect(view.calendar.periods.map((p) => p.label)).toEqual(["전체", "2026년 10월", "2026년 9월", "2026년 8월"]);
    expect(view.calendar.ratios.map((r) => r.metric)).toEqual(["reply", "notice_changed", "decline"]);
    expect(view.calendar.ratios[2]!.cells.map((c) => c.count)).toEqual(["2 / 3", "1 / 1", "0 / 0", "1 / 2"]);
  });

  it("지표 이름은 짧게, 설명은 따로", () => {
    const all = [...view.cohort.ratios, ...view.calendar.ratios];
    for (const r of all) {
      expect(r.label.length).toBeLessThanOrEqual(16);
      expect(r.hint.length).toBeGreaterThan(0);
    }
  });

  it("INV-Q4: 가입 경로는 다섯 답 + 고르지 않음, 정해진 순서 — 기간은 최근 3개월 표와 같다", () => {
    expect(view.sources.map((s) => s.label)).toEqual(["X", "크리에이터 방송", "팬 커뮤니티", "지인", "기타", "고르지 않음"]);
    expect(view.sources[1]!.cells[0]).toEqual({ period: "all", rate: "66.7%", count: "2 / 3" });
    expect(view.sources[5]!.cells.map((c) => c.period)).toEqual(["all", "2026-10", "2026-09", "2026-08"]);
  });

  it("INV-Q4: utm 은 전체 기간의 값별 건수, 이름은 한국어 먼저", () => {
    expect(view.utm.map((u) => u.label)).toEqual(["공유 링크 출처(utm_source)", "공유 링크 매체(utm_medium)", "공유 링크 캠페인(utm_campaign)"]);
    expect(view.utm.find((u) => u.kind === "utm_source")?.items).toEqual([{ value: "x_share", rate: "33.3%", count: "1 / 3" }]);
    expect(view.utm.find((u) => u.kind === "utm_medium")?.items).toEqual([]);
  });

  it("모르는 지표 줄은 버린다 — 그 줄의 기간도 표에 나오지 않는다", () => {
    expect(JSON.stringify(view)).not.toContain("unknown_metric");
    expect(JSON.stringify(view)).not.toContain("2026-01");
  });

  it("줄이 하나도 없어도 전체 칸은 있다", () => {
    const empty = buildMetricsView([]);
    expect(empty.cohort.periods.map((p) => p.key)).toEqual(["all"]);
    expect(empty.calendar.periods.map((p) => p.key)).toEqual(["all"]);
    expect(empty.cohort.ratios[0]!.cells).toEqual([{ period: "all", rate: NOT_YET, count: "0 / 0" }]);
  });
});
