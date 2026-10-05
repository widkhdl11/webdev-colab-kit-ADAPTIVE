// 주문 상태. 전환 규칙(어느 스캔이 어느 상태로 넘기는가)은 상태 전환 스펙에서 정한다.
// 여기 있는 판정은 승인·복호화 스펙이 요구하는 것만이다.
export const ORDER_STATUSES = [
  "registered", // 등록 — 승인 대기
  "approved", // 승인
  "received", // 입고
  "labeled", // 내부 라벨 부착 확인
  "inspected", // 검수 완료
  "label_printed", // 송장 출력
  "shipped", // 출고 확정
  "rejected", // 크리에이터 거절
  "expired", // 7일 자동 반려
  "canceled", // 취소
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** INV-S6: 승인을 받을 수 있는 상태. 거절·반려·취소된 주문은 서명이 와도 승인하지 않는다. */
export function isApprovable(status: OrderStatus): boolean {
  return status === "registered" || status === "received" || status === "labeled" || status === "inspected";
}

/** INV-P4 (c)·INV-P5: 송장을 출력(=주소 복호화)할 수 있는 상태. 출고 확정 뒤에는 열리지 않는다. */
export function isPrintable(status: OrderStatus): boolean {
  return status === "inspected" || status === "label_printed";
}
