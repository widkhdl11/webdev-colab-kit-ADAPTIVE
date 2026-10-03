import type { PriceTableProblem, TierPrice } from "@/entities/payment/model/price-table";

// 요금표 입력 칸과 자동 계산 칸 (admin-console INV-K4, reverse-gift INV-R3).

/** 입력 글자 → 원. 쉼표·공백·「원」은 무시하고, 숫자가 하나도 없으면 NaN(검사에서 걸린다). */
export function parseWon(text: string): number {
  const digits = text.replace(/[\s,원]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

export function formatWon(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("ko-KR") : "—";
}

/** 기본 서비스료 = 받는 값 − 택배 원가 − 검수비 */
export function serviceFeeOf(p: TierPrice): number {
  return p.priceKrw - p.carrierCostKrw - p.inspectionFeeKrw;
}

/** 역조공 요금 = 받는 값 − 검수비 (저장하지 않고 늘 계산한다) */
export function revgiftFeeOf(p: TierPrice): number {
  return p.priceKrw - p.inspectionFeeKrw;
}

export type PriceRule = "a" | "b" | "c";

export const PRICE_RULES: readonly { rule: PriceRule; text: string }[] = [
  { rule: "a", text: "모든 값이 0 이상 정수, 받는 값은 1원 이상" },
  { rule: "b", text: "구간마다 택배 원가 + 검수비 ≤ 받는 값 (서비스료가 마이너스가 되지 않아요)" },
  { rule: "c", text: "받는 값·택배 원가·검수비 모두 소형 ≤ 중형 ≤ 대형" },
];

/** 검사 결과(첫 번째로 어긴 조건)가 화면 목록의 어느 줄인가 */
export function ruleOfProblem(problem: PriceTableProblem): PriceRule {
  if (problem === "costs_exceed_price") return "b";
  if (problem === "not_ascending") return "c";
  return "a";
}
