// 승인 요청 카드의 지난 검수 내역(decline-block INV-D11, 카드 d80 「나에게 보낸 것만」).
// 그 팬이 이 크리에이터에게 보낸 지난 주문(지금 요청 주문 제외, 결제가 끝난 것)의 수와 그 가운데 검수 통과·반송 수.
// 세는 것은 DB 읽기 함수가 한다 — 다른 크리에이터에게 보낸 주문은 여기까지 오지 않는다.
// 경고·자동 거절·점수는 만들지 않는다. 수를 사실대로 보여 주고 판단은 크리에이터가 한다.
export type PriorGiftHistory = {
  /** 지난 주문 수 */
  gifts: number;
  /** 그중 검수 통과 */
  passed: number;
  /** 그중 검수 반송 */
  returned: number;
};

export function priorHistoryLabel(h: PriorGiftHistory): string {
  if (h.gifts === 0) return "첫 선물 요청";
  const head = `지난 선물 ${h.gifts}건`;
  if (h.returned === 0 && h.passed === h.gifts) return `${head} · 모두 검수 통과`;
  const rest = h.gifts - h.passed - h.returned;
  const parts = [
    h.passed > 0 ? `검수 통과 ${h.passed}건` : null,
    h.returned > 0 ? `검수 반송 ${h.returned}건` : null,
    rest > 0 ? `검수 결과 없음 ${rest}건` : null,
  ].filter((p): p is string => p !== null);
  return [head, ...parts].join(" · ");
}
