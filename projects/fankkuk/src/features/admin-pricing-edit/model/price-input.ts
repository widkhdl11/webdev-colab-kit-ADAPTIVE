import type { PriceTableProblem } from "@/entities/payment/model/price-table";

// 요금표 입력 칸 (admin-console INV-K4). 자동 계산 칸(서비스료·역조공 요금)은 결제 계산과 같은 함수(entities/payment charge)를 쓴다.

/** 입력 글자 → 원. 쉼표·공백·「원」은 무시하고, 숫자가 하나도 없으면 NaN(검사에서 걸린다). */
export function parseWon(text: string): number {
  const digits = text.replace(/[\s,원]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

export function formatWon(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("ko-KR") : "—";
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
