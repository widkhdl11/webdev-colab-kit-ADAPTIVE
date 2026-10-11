import { HEARD_FROM, HEARD_FROM_LABEL } from "./signup-source";

// 운영자 「측정」 화면 — DB 집계 줄(admin_metrics)을 표로 바꾼다 (metrics INV-Q2·Q3·Q5).
// 집계 줄에는 비율과 분자·분모만 있다(INV-Q2). 여기서도 그 셋만 글자로 바꾼다.
// 비율은 DB 가 준 값(분자 ÷ 분모, 분모 0 이면 비어 있음)을 여기서 한 번만 반올림한다 — 반올림 규칙은 이 파일에만 있다.
// 비어 있으면 0% 가 아니라 「아직 셀 수 없어요」 — 아직 다시 보낼 시간이 없던 달을 0% 로 읽지 않게.
// 표는 둘이다. 재발송률 세 줄은 첫 선물을 보낸 달 가운데 60일이 다 지난 최근 세 달(DB 가 고른다), 나머지는 최근 3개월.

export type MetricRow = { metric: string; period: string; bucket: string; numerator: number; denominator: number; rate: number | null };

export const NOT_YET = "아직 셀 수 없어요";

export type MetricCell = { period: string; rate: string; count: string };

type CohortMetric = "resend" | "resend_replied" | "resend_not_replied";
type CalendarMetric = "reply" | "notice_changed" | "decline";
type UtmKind = "utm_source" | "utm_medium" | "utm_campaign";

type RatioDef<M extends string> = { metric: M; label: string; hint: string };

const COHORT: readonly RatioDef<CohortMetric>[] = [
  { metric: "resend", label: "재발송률", hint: "첫 선물을 보낸 지 60일이 지난 팬 가운데, 60일 안에 한 번 더 보낸 팬" },
  { metric: "resend_replied", label: "재발송률 · 답장 받은 팬", hint: "첫 선물의 상자에 지우지 않은 답장이 남은 팬만" },
  { metric: "resend_not_replied", label: "재발송률 · 답장 못 받은 팬", hint: "첫 선물의 상자에 남은 답장이 없는 팬만" },
];

const CALENDAR: readonly RatioDef<CalendarMetric>[] = [
  { metric: "reply", label: "감사 답장률", hint: "받았어요가 남은 상자 가운데 답장이 남은(지우지 않은) 상자" },
  { metric: "notice_changed", label: "품목 안내 뒤 바꾼 비율", hint: "받기 어려운 품목 안내가 뜬 뒤 결제까지 간 주문 가운데 품목을 바꾼 주문" },
  { metric: "decline", label: "거절률", hint: "승인·거절이 정해진 선물 가운데 거절·7일 자동 반려된 선물" },
];

const UTM_KINDS: readonly { kind: UtmKind; label: string }[] = [
  { kind: "utm_source", label: "공유 링크 출처(utm_source)" },
  { kind: "utm_medium", label: "공유 링크 매체(utm_medium)" },
  { kind: "utm_campaign", label: "공유 링크 캠페인(utm_campaign)" },
];

/** DB 비율로 백분율(소수 첫째 자리까지, 끝의 0 은 뺀다). 비어 있으면 NOT_YET. */
export function rateText(r: { rate: number | null }): string {
  if (r.rate === null) return NOT_YET;
  return `${Math.round(r.rate * 1000) / 10}%`;
}

const countText = (r: { numerator: number; denominator: number }) => `${r.numerator} / ${r.denominator}`;

/** 'all' → 전체, 'YYYY-MM' → 'YYYY년 M월'(한국 시간 달). */
export function periodLabel(period: string): string {
  if (period === "all") return "전체";
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${m[1]}년 ${Number(m[2])}월` : period;
}

type Period = { key: string; label: string };
type RatioTable<M extends string> = { periods: Period[]; ratios: (RatioDef<M> & { cells: MetricCell[] })[] };

export type MetricsView = {
  cohort: RatioTable<CohortMetric>;
  calendar: RatioTable<CalendarMetric>;
  sources: { bucket: string; label: string; cells: MetricCell[] }[];
  utm: { kind: UtmKind; label: string; items: { value: string; rate: string; count: string }[] }[];
};

export function buildMetricsView(rows: readonly MetricRow[]): MetricsView {
  // 그 지표들의 기간 — 전체 다음, DB 가 준 순서(최근 달부터) 그대로
  const periodsOf = (metrics: readonly string[]): string[] => {
    const months: string[] = [];
    for (const r of rows) if (metrics.includes(r.metric) && r.period !== "all" && !months.includes(r.period)) months.push(r.period);
    return ["all", ...months];
  };

  const cellOf = (metric: string, period: string, bucket = ""): MetricCell => {
    const r = rows.find((x) => x.metric === metric && x.period === period && x.bucket === bucket) ?? { numerator: 0, denominator: 0, rate: null };
    return { period, rate: rateText(r), count: countText(r) };
  };

  const table = <M extends string>(defs: readonly RatioDef<M>[], periods: string[]): RatioTable<M> => ({
    periods: periods.map((key) => ({ key, label: periodLabel(key) })),
    ratios: defs.map((m) => ({ ...m, cells: periods.map((p) => cellOf(m.metric, p)) })),
  });

  const calendarPeriods = periodsOf(CALENDAR.map((m) => m.metric));

  return {
    cohort: table(COHORT, periodsOf(COHORT.map((m) => m.metric))),
    calendar: table(CALENDAR, calendarPeriods),
    // 가입 경로는 최근 3개월 표와 같은 달 — DB 가 같은 기간으로 센다
    sources: [...HEARD_FROM, "none" as const].map((bucket) => ({
      bucket,
      label: bucket === "none" ? "고르지 않음" : HEARD_FROM_LABEL[bucket],
      cells: calendarPeriods.map((p) => cellOf("signup_source", p, bucket)),
    })),
    utm: UTM_KINDS.map((u) => ({
      ...u,
      items: rows
        .filter((r) => r.metric === u.kind && r.period === "all")
        .map((r) => ({ value: r.bucket, rate: rateText(r), count: countText(r) })),
    })),
  };
}
