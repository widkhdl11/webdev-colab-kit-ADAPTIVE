// 선물함(팬에게 보내기) 서비스료 설정값 (revgift-box INV-GB13~GB15) — 정가와 초기 크리에이터 값.
// 바뀐 값은 그 뒤에 만드는 명세서부터 쓰인다(이미 만든 명세서는 다시 계산하지 않는다, INV-GB13).

export type BoxServiceFees = { regularKrw: number; earlyKrw: number };

/** DB 검사와 같은 범위: 0 ≤ 초기 크리에이터 ≤ 정가 ≤ 100,000원 */
export const BOX_SERVICE_FEE_MAX_KRW = 100_000;

export type BoxServiceFeesProblem = "out_of_range" | "early_above_regular";

function isWon(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= BOX_SERVICE_FEE_MAX_KRW;
}

export function boxServiceFeesProblem(fees: BoxServiceFees): BoxServiceFeesProblem | null {
  if (!isWon(fees.regularKrw) || !isWon(fees.earlyKrw)) return "out_of_range";
  if (fees.earlyKrw > fees.regularKrw) return "early_above_regular";
  return null;
}

/** admin_box_service_fees() 의 jsonb → 화면 꼴. 꼴이 다르면 null. */
export function boxServiceFeesFromRow(raw: unknown): BoxServiceFees | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isWon(r.regular_krw) || !isWon(r.early_krw)) return null;
  return { regularKrw: r.regular_krw, earlyKrw: r.early_krw };
}
