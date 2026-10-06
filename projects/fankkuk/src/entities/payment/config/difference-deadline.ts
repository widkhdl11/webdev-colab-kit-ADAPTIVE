// 차액 결제 기한. 차액을 요청한 뒤 이 날수(168시간) 안에 내지 않으면 그 주문은 나갈 수 없게 되고 반송 대상이 된다(payment INV-M13).
// 실제 판정은 DB 의 7일 처리가 한다 — 화면 문구는 숫자를 직접 쓰지 않고 이 값을 읽는다.
export const DIFFERENCE_DEADLINE_DAYS = 7;
