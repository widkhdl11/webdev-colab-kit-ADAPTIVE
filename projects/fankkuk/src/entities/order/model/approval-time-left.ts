import { APPROVAL_DEADLINE_DAYS } from "../config/approval-deadline";

// 승인 요청의 「남은 기간」 꼬리표. 자동 반려는 결제 완료(등록) 시각부터 168시간이다(office-workflow INV-W6) —
// 그 시각에서 지난 시간을 빼 남은 시간을 센다. 기준 시각(now)은 화면을 그리는 서버가 넘긴다 — 브라우저가 따로 세면
// 서버가 그린 글자와 몇 초 차이로 달라질 수 있다.
// 하루 넘게 남으면 일(내림 — 넉넉하게 보이지 않게), 하루 안이면 시간(올림 — 「0시간」이 나오지 않게).
// 기한이 지나면 승인 함수가 승인을 받지 않는다(같은 168시간). 자동 처리가 돌기 전까지 대기 목록에 남지만 할 수 있는 것은
// 「받지 않기」뿐이라, 화면은 승인 버튼을 감추고 이 판정을 쓴다.

const HOUR_MS = 3_600_000;
const DEADLINE_MS = APPROVAL_DEADLINE_DAYS * 24 * HOUR_MS;

function msLeft(registeredAt: string, now: string): number {
  return Date.parse(registeredAt) + DEADLINE_MS - Date.parse(now);
}

/** 승인 기한 시각 — 결제 완료(등록) 시각 + 168시간(approval-signature INV-S6). 팬 선물 상세 「기한 ○월 ○일 (요일)까지」. */
export function approvalDeadlineAt(registeredAt: string): string {
  return new Date(Date.parse(registeredAt) + DEADLINE_MS).toISOString();
}

/** 승인 기한이 지났는가 — 지났으면 승인 버튼을 두지 않는다. */
export function isApprovalDeadlinePassed(registeredAt: string, now: string): boolean {
  return msLeft(registeredAt, now) <= 0;
}

export function approvalTimeLeftLabel(registeredAt: string, now: string): string {
  const left = msLeft(registeredAt, now);
  if (left <= 0) return "승인 기한 지남";
  if (left < 24 * HOUR_MS) return `남은 기간 ${Math.ceil(left / HOUR_MS)}시간`;
  return `남은 기간 ${Math.floor(left / (24 * HOUR_MS))}일`;
}
