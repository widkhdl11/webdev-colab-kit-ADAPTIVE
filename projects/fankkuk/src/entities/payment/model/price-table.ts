import { z } from "zod";

// 상자 구간 요금표 (admin-console INV-K4·K6, payment INV-M1·M7). 운영 값은 DB 요금표(tier_prices)에만 있고 대표가 바꾼다.
// 코드에는 요금 숫자가 없다 — 화면·결제 계산은 요청마다 DB 에서 읽은 표를 넘겨받는다.

export const PRICED_TIERS = ["small", "medium", "large"] as const;

export type PricedTier = (typeof PRICED_TIERS)[number];

export type TierPrice = { priceKrw: number; carrierCostKrw: number; inspectionFeeKrw: number };

export type PriceTable = Readonly<Record<PricedTier, TierPrice>>;

/** 앱이 요금표를 읽은 뒤 등록하기 전에 대표가 요금을 바꿔 DB 등록 함수가 금액을 거부했을 때의 문구(INV-K3). */
export const PRICE_CHANGED_MESSAGE = "요금이 방금 바뀌었어요. 금액을 다시 확인하고 결제해 주세요.";

export type PriceTableProblem = "not_integer" | "price_zero" | "costs_exceed_price" | "not_ascending" | "shape";

export function isPricedTier(value: unknown): value is PricedTier {
  return value === "small" || value === "medium" || value === "large";
}

const tierPriceShape = z.object({ priceKrw: z.unknown(), carrierCostKrw: z.unknown(), inspectionFeeKrw: z.unknown() }).strict();
const tableShape = z.object({ small: tierPriceShape, medium: tierPriceShape, large: tierPriceShape }).strict();

const FIELDS = ["priceKrw", "carrierCostKrw", "inspectionFeeKrw"] as const;

/**
 * INV-K4: (a) 모든 값은 0 이상 정수, 받는 값 1원 이상 (b) 택배 원가 + 검수비 ≤ 받는 값 (c) 각 칸 소형 ≤ 중형 ≤ 대형.
 * 하나라도 어기면 통째로 거부한다. DB 요금 변경 함수도 같은 조건을 다시 확인한다 — 이 검사는 화면 입력의 경계다.
 */
export function checkPriceTable(input: unknown): { ok: true; table: PriceTable } | { ok: false; problem: PriceTableProblem } {
  const shaped = tableShape.safeParse(input);
  if (!shaped.success) return { ok: false, problem: "shape" };
  const t = shaped.data;
  for (const tier of PRICED_TIERS) {
    for (const f of FIELDS) {
      const v = t[tier][f];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { ok: false, problem: "not_integer" };
    }
  }
  const table = t as PriceTable;
  for (const tier of PRICED_TIERS) {
    const p = table[tier];
    if (p.priceKrw < 1) return { ok: false, problem: "price_zero" };
    if (p.carrierCostKrw + p.inspectionFeeKrw > p.priceKrw) return { ok: false, problem: "costs_exceed_price" };
  }
  for (const f of FIELDS) {
    if (!(table.small[f] <= table.medium[f] && table.medium[f] <= table.large[f])) return { ok: false, problem: "not_ascending" };
  }
  return { ok: true, table };
}

/** DB 읽기 함수(current_tier_prices·admin_tier_prices)가 돌려준 줄을 요금표로. 모양이 다르거나 조건을 어기면 null. */
export function priceTableFromRows(rows: unknown): PriceTable | null {
  if (!Array.isArray(rows)) return null;
  const byTier: Record<string, TierPrice> = {};
  for (const r of rows as Record<string, unknown>[]) {
    if (!isPricedTier(r?.tier)) return null;
    byTier[r.tier] = { priceKrw: r.price_krw as number, carrierCostKrw: r.carrier_cost_krw as number, inspectionFeeKrw: r.inspection_fee_krw as number };
  }
  const checked = checkPriceTable(byTier);
  return checked.ok ? checked.table : null;
}
