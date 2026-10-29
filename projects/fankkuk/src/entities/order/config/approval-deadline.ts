// 승인 기한. 등록 뒤 이 날수 안에 크리에이터가 정하지 않으면 자동으로 받지 않음 처리된다(주문 상태 expired).
// 화면 문구는 숫자를 직접 쓰지 않고 이 값을 읽는다 — 기한이 바뀌면 문구가 같이 바뀐다.
export const APPROVAL_DEADLINE_DAYS = 7;

/** 기한이 지난 요청을 승인·거절하려 할 때 — 자동 처리가 아직 돌지 않았어도 같은 답(decline-block INV-D2 · approval-signature INV-S6). */
export const APPROVAL_EXPIRED_MESSAGE = "승인 기한이 지나 자동 반려된 선물입니다.";
