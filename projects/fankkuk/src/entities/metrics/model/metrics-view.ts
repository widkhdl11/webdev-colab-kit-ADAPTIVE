import { HEARD_FROM, HEARD_FROM_LABEL } from "./signup-source";

// 운영자 「측정」 화면 — DB 집계 줄(admin_metrics)을 표로 바꾼다 (metrics INV-Q2·Q3·Q5).
// 집계 줄에는 비율과 분자·분모만 있다(INV-Q2). 여기서도 그 셋만 글자로 바꾼다.
// 분모가 0 이면 0% 가 아니라 「아직 셀 수 없어요」 — 아직 다시 보낼 시간이 없던 달을 0% 로 읽지 않게.

export type MetricRow = { metric: string; period: string; bucket: string; numerator: number; denominator: number; rate: number | null };

export const NOT_YET = "아직 셀 수 없어요";

export type MetricCell = { period: string; rate: string; count: string };

type RatioMetric = "resend" | "resend_replied" | "resend_not_replied" | "reply" | "notice_changed" | "decline";
type UtmKind = "utm_source" | "utm_medium" | "utm_campaign";

const RATIOS: readonly { metric: RatioMetric; label: string; hint: string }[] = [
  { metric: "resend", label: "재발송률", hint: "첫 선물을 보낸 지 60일이 지난 팬 가운데, 60일 안에 한 번 더 보낸 팬" },
  { metric: "resend_replied", label: "재발송률 · 첫 선물에 답장을 받은 팬", hint: "첫 선물의 상자에 지우지 않은 답장이 남은 팬만" },
  { metric: "resend_not_replied", label: "재발송률 · 첫 선물에 답장을 못 받은 팬", hint: "첫 선물의 상자에 남은 답장이 없는 팬만" },
  { metric: "reply", label: "감사 답장률", hint: "받았어요가 남은 상자 가운데 답장이 남은(지우지 않은) 상자" },
  { metric: "notice_changed", label: "품목 안내 뒤 바꾼 비율", hint: "받기 어려운 품목 안내가 뜬 뒤 결제까지 간 주문 가운데 품목을 바꾼 주문" },
  { metric: "decline", label: "거절률", hint: "승인·거절이 정해진 선물 가운데 거절·7일 자동 반려된 선물" },
];

const UTM_KINDS: readonly { kind: UtmKind; label: string }[] = [
  { kind: "utm_source", label: "utm_source" },
  { kind: "utm_medium", label: "utm_medium" },
  { kind: "utm_campaign", label: "utm_campaign" },
];

/** 분자·분모로 백분율(소수 첫째 자리까지, 끝의 0 은 뺀다). 분모가 0 이면 NOT_YET. */
export function rateText(r: { numerator: number; denominator: number }): string {
  if (r.denominator <= 0) return NOT_YET;
  const pct = Math.round((r.numerator / r.denominator) * 1000) / 10;
  return `${pct}%`;
}

const countText = (r: { numerator: number; denominator: number }) => `${r.numerator} / ${r.denominator}`;

/** 'all' → 전체, 'YYYY-MM' → 'YYYY년 M월'(한국 시간 달). */
export function periodLabel(period: string): string {
  if (period === "all") return "전체";
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${m[1]}년 ${Number(m[2])}월` : period;
}

export type MetricsView = {
  periods: { key: string; label: string }[];
  ratios: { metric: RatioMetric; label: string; hint: string; cells: MetricCell[] }[];
  sources: { bucket: string; label: string; cells: MetricCell[] }[];
  utm: { kind: UtmKind; label: string; items: { value: string; rate: string; count: string }[] }[];
};

export function buildMetricsView(rows: readonly MetricRow[]): MetricsView {
  // 기간은 DB 가 준 순서(전체 → 이번 달 → 앞 달) 그대로 — 처음 나온 순서를 지킨다
  const keys: string[] = [];
  for (const r of rows) if (!keys.includes(r.period)) keys.push(r.period);
  if (!keys.includes("all")) keys.unshift("all");
  const ordered = ["all", ...keys.filter((k) => k !== "all")];

  const cellOf = (metric: string, period: string, bucket = ""): MetricCell => {
    const hit = rows.find((r) => r.metric === metric && r.period === period && r.bucket === bucket);
    const r = hit ?? { numerator: 0, denominator: 0 };
    return { period, rate: rateText(r), count: countText(r) };
  };

  return {
    periods: ordered.map((key) => ({ key, label: periodLabel(key) })),
    ratios: RATIOS.map((m) => ({ ...m, cells: ordered.map((p) => cellOf(m.metric, p)) })),
    sources: [...HEARD_FROM, "none" as const].map((bucket) => ({
      bucket,
      label: bucket === "none" ? "고르지 않음" : HEARD_FROM_LABEL[bucket],
      cells: ordered.map((p) => cellOf("signup_source", p, bucket)),
    })),
    utm: UTM_KINDS.map((u) => ({
      ...u,
      items: rows
        .filter((r) => r.metric === u.kind && r.period === "all")
        .map((r) => ({ value: r.bucket, rate: rateText(r), count: countText(r) })),
    })),
  };
}
