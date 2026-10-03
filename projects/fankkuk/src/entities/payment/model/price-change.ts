import { isPricedTier, type PricedTier } from "./price-table";

// 요금 바꾼 기록 한 줄 (admin-console INV-K5·K8). 언제 · 누가(닉네임만) · 어느 구간의 · 어느 칸을 · 얼마에서 얼마로.
// DB 읽기 함수가 돌려준 줄에서 정해진 칸만 옮긴다 — 다른 칸이 섞여 와도 화면까지 가지 않는다.

export const PRICE_FIELDS = ["price_krw", "carrier_cost_krw", "inspection_fee_krw"] as const;

export type PriceField = (typeof PRICE_FIELDS)[number];

export type PriceChange = {
  at: string;
  byNickname: string;
  tier: PricedTier;
  field: PriceField;
  beforeKrw: number;
  afterKrw: number;
};

export const PRICE_FIELD_NAME: Readonly<Record<PriceField, string>> = {
  price_krw: "받는 값",
  carrier_cost_krw: "택배 원가",
  inspection_fee_krw: "검수비",
};

function isPriceField(value: unknown): value is PriceField {
  return PRICE_FIELDS.includes(value as PriceField);
}

/** 모양이 다른 줄은 버리지 않고 실패로 알린다(null) — 기록이 몰래 빠지면 분쟁 근거가 사라진다. */
export function priceChangesFromRows(rows: unknown): PriceChange[] | null {
  if (!Array.isArray(rows)) return null;
  const out: PriceChange[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const { at, changed_by_nickname: by, tier, field, before_krw: before, after_krw: after } = r ?? {};
    if (typeof at !== "string" || typeof by !== "string" || !isPricedTier(tier) || !isPriceField(field)) return null;
    if (typeof before !== "number" || typeof after !== "number") return null;
    out.push({ at, byNickname: by, tier, field, beforeKrw: before, afterKrw: after });
  }
  return out;
}
