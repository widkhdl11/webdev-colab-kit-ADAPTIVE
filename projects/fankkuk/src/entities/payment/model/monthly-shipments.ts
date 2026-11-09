import { z } from "zod";

// 월 발송 건수와 「택배 경로 재검토」 경고 (admin-console INV-K17).
// 로지아이 소호사업자택배는 월 30건이 등급 기준이라, 끝난 달 기준 미만이 이어지면 대표가 경로를 다시 본다.
// 기준 건수·이어지는 달 수는 DB 설정값(pricing_settings)이고 코드에는 숫자가 없다.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const rowSchema = z.object({
  current_month: z.string().regex(MONTH),
  months: z.array(z.object({ month: z.string().regex(MONTH), count: z.number().int().min(0) })).min(1),
  first_month: z.string().regex(MONTH).nullable(),
  min_monthly: z.number().int().min(1),
  months_needed: z.number().int().min(1),
});

export type MonthCount = { month: string; count: number };

export type MonthlyShipments = {
  /** 서울 기준 이번 달 "2026-11" */
  currentMonth: string;
  /** 오래된 달부터, 마지막이 이번 달 */
  months: readonly MonthCount[];
  /** 처음 발송한 달 — 없으면 null */
  firstMonth: string | null;
  minMonthly: number;
  monthsNeeded: number;
};

/** admin_monthly_shipments() 의 jsonb → 화면 꼴. 꼴이 다르거나 마지막 달이 이번 달이 아니면 null. */
export function monthlyShipmentsFromRow(raw: unknown): MonthlyShipments | null {
  const r = rowSchema.safeParse(raw);
  if (!r.success) return null;
  const v = r.data;
  if (v.months[v.months.length - 1]!.month !== v.current_month) return null;
  return {
    currentMonth: v.current_month,
    months: v.months.map((m) => ({ month: m.month, count: m.count })),
    firstMonth: v.first_month,
    minMonthly: v.min_monthly,
    monthsNeeded: v.months_needed,
  };
}

export type RouteReview = {
  warn: boolean;
  /** 판정에 쓴 끝난 달(오래된 달부터). 판정할 만큼 달이 없으면 빈 배열 */
  judged: readonly MonthCount[];
};

/**
 * 끝난 달 가운데 최근 monthsNeeded 달이 모두 minMonthly 건 미만이면 경고.
 * 이번 달은 아직 끝나지 않아 세지 않는다. 처음 발송한 달과 그 전 달은 한 달을 다 쓰지 않았으므로 판정에 넣지 않는다 —
 * 그런 달이 끼면(= 운영한 끝난 달이 모자라면) 경고하지 않는다.
 */
export function routeReview(s: MonthlyShipments): RouteReview {
  if (s.firstMonth === null) return { warn: false, judged: [] };
  const first = s.firstMonth;
  const done = s.months.filter((m) => m.month < s.currentMonth);
  const recent = done.slice(-s.monthsNeeded);
  if (recent.length < s.monthsNeeded || recent.some((m) => m.month <= first)) return { warn: false, judged: [] };
  return { warn: recent.every((m) => m.count < s.minMonthly), judged: recent };
}

/** "2026-11" → "2026년 11월" */
export function formatMonthKo(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}
