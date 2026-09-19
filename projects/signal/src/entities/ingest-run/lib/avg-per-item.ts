/**
 * "글당 평균" 계산 하나로 소요시간·토큰 등 여러 칸이 같은 0-나눗셈 규칙을 쓴다
 * (2026-08-17) — 글이 0건이면 나눌 수 없다. null 로 "잴 수 없음"을 표시한다.
 */
export function avgPerItem(total: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round(total / count);
}
